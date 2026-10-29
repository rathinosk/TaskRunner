import * as assert from 'assert';
import { emptyConfig, parseConfig } from '../../src/core/config';

const errors = (text: string) => parseConfig(text).issues.filter((i) => i.severity === 'error');

describe('core/config', () => {
  it('emptyConfig has no buttons', () => {
    assert.deepStrictEqual(emptyConfig(), { buttons: [] });
  });

  describe('valid files', () => {
    const text = `{
  // comments and trailing commas are fine
  "$schema": "./x.json",
  "buttons": [
    { "task": "build", "label": "Build", "icon": "tools" },
    { "task": "test", "source": "npm", "folder": "api", "confirm": true, "tooltip": "Run tests" },
    { "command": "doxygen Doxyfile", "cwd": "\${workspaceFolder}/docs", "env": { "A": "1" }, "shell": "bash", "id": "docs" },
  ],
}`;

    it('reads task and shell buttons in order', () => {
      const { config, issues } = parseConfig(text);
      assert.deepStrictEqual(issues, []);
      assert.ok(config);
      assert.deepStrictEqual(
        config.buttons.map((b) => [b.kind, b.kind === 'task' ? b.task : b.kind === 'shell' ? b.command : b.kind === 'command' ? b.vscode : b.group]),
        [
          ['task', 'build'],
          ['task', 'test'],
          ['shell', 'doxygen Doxyfile'],
        ],
      );
      const [build, test, docs] = config.buttons;
      assert.strictEqual(build?.label, 'Build');
      assert.strictEqual(build?.icon, 'tools');
      assert.strictEqual(build?.confirm, false);
      assert.ok(test?.kind === 'task');
      assert.deepStrictEqual([test.source, test.folder, test.confirm, test.tooltip], ['npm', 'api', true, 'Run tests']);
      assert.ok(docs?.kind === 'shell');
      assert.deepStrictEqual([docs.id, docs.cwd, docs.env, docs.shell], ['docs', '${workspaceFolder}/docs', { A: '1' }, 'bash']);
    });

    it('derives stable ids from what a button runs, and numbers repeats', () => {
      const a = parseConfig('{"buttons":[{"task":"x"},{"task":"x"},{"task":"y"}]}').config!.buttons.map((b) => b.id);
      assert.match(a[0]!, /^task-[0-9a-f]{8}$/);
      assert.strictEqual(a[1], `${a[0]}-2`);
      assert.notStrictEqual(a[2], a[0]);
      const again = parseConfig('{"buttons":[{"task":"y"},{"task":"x"}]}').config!.buttons.map((b) => b.id);
      assert.deepStrictEqual(again, [a[2], a[0]]);
    });

    it('reads VS Code command buttons with any JSON args, as written', () => {
      const { config, issues } = parseConfig(`{"buttons":[
        {"vscode":"workbench.action.files.saveAll"},
        {"vscode":"a.b","args":"build"},
        {"vscode":"a.b","args":{"snippet":"$0","n":[1,true,null]}},
        {"vscode":"a.b","args":3},
        {"vscode":"a.b","args":null}
      ]}`);
      assert.deepStrictEqual(issues, []);
      const all = config!.buttons.map((b) => (b.kind === 'command' ? [b.vscode, b.args] : b.kind));
      assert.deepStrictEqual(all, [
        ['workbench.action.files.saveAll', undefined],
        ['a.b', 'build'],
        ['a.b', { snippet: '$0', n: [1, true, null] }],
        ['a.b', 3],
        ['a.b', null],
      ]);
      assert.ok(!('args' in config!.buttons[0]!));
    });

    it('derives a command button id from the command and its args', () => {
      const ids = (json: string) => parseConfig(json).config!.buttons.map((b) => b.id);
      const [a, b, c] = ids('{"buttons":[{"vscode":"x"},{"vscode":"x","args":1},{"vscode":"x","args":2}]}');
      assert.match(a!, /^vscode-[0-9a-f]{8}$/);
      assert.strictEqual(new Set([a, b, c]).size, 3);
      assert.deepStrictEqual(ids('{"buttons":[{"vscode":"x","args":1,"label":"L"}]}'), [b]);
    });

    it('accepts an empty button list', () => {
      assert.deepStrictEqual(parseConfig('{"buttons":[]}').config, { buttons: [] });
    });
  });

  describe('errors', () => {
    it('reports a syntax error with its line', () => {
      const { config, issues } = parseConfig('{\n  "buttons": [\n    { "task": }\n  ]\n}');
      assert.strictEqual(config, undefined);
      assert.strictEqual(issues[0]?.severity, 'error');
      assert.strictEqual(issues[0]?.line, 2);
    });

    it('reports a path and line for a schema error', () => {
      const { config, issues } = parseConfig('{\n  "buttons": [\n    { "task": "a" },\n    { "task": "b", "icon": 3 }\n  ]\n}');
      assert.strictEqual(config, undefined);
      assert.deepStrictEqual(
        issues.map((i) => [i.path, i.line, i.message]),
        [['buttons[1].icon', 3, '"icon" must be a string']],
      );
    });

    it('rejects the wrong top-level shape', () => {
      for (const text of ['[]', '"x"', '{}', '{"buttons": {}}', '']) {
        assert.strictEqual(parseConfig(text).config, undefined, text);
        assert.strictEqual(errors(text).length, 1, text);
      }
    });

    it('needs exactly one of task, command, vscode and group', () => {
      assert.match(errors('{"buttons":[{}]}')[0]!.message, /needs "task"/);
      assert.match(errors('{"buttons":[{"task":"a","command":"b"}]}')[0]!.message, /not "task" and "command"/);
      assert.match(errors('{"buttons":[{"vscode":"a","command":"b"}]}')[0]!.message, /not "command" and "vscode"/);
      assert.match(errors('{"buttons":[{"group":"g","buttons":[],"vscode":"a"}]}')[0]!.message, /not "group" and "vscode"/);
      assert.strictEqual(errors('{"buttons":[{"vscode":""}]}').length, 1);
      assert.match(errors('{"buttons":["x"]}')[0]!.message, /must be an object/);
    });

    it('checks field types', () => {
      assert.strictEqual(errors('{"buttons":[{"task":""}]}').length, 1);
      assert.strictEqual(errors('{"buttons":[{"task":"a","confirm":"yes"}]}').length, 1);
      assert.strictEqual(errors('{"buttons":[{"command":"a","env":{"A":1}}]}').length, 1);
      assert.strictEqual(errors('{"buttons":[{"command":"a","env":[]}]}').length, 1);
      assert.strictEqual(errors('{"buttons":[{"task":"a","id":"has space"}]}').length, 1);
      assert.strictEqual(errors('{"buttons":[{"task":"a","label":5}]}').length, 1);
    });

    it('rejects duplicate explicit ids, pointing at the second', () => {
      const issues = errors('{"buttons":[{"task":"a","id":"x"},{"task":"b","id":"x"}]}');
      assert.deepStrictEqual(
        issues.map((i) => i.path),
        ['buttons[1].id'],
      );
    });

    it('does not let a derived id take an explicit one', () => {
      const first = parseConfig('{"buttons":[{"task":"a"}]}').config!.buttons[0]!.id;
      const { config } = parseConfig(`{"buttons":[{"task":"a"},{"task":"b","id":"${first}"}]}`);
      assert.strictEqual(config?.buttons[1]?.id, first);
      assert.strictEqual(config?.buttons[0]?.id, `${first}-2`);
    });
  });

  describe('warnings', () => {
    it('warns on unknown keys and keeps the config', () => {
      const { config, issues } = parseConfig('{"extra":1,"buttons":[{"task":"a","colour":"red"}]}');
      assert.ok(config);
      assert.deepStrictEqual(
        issues.map((i) => [i.severity, i.path]),
        [
          ['warning', 'extra'],
          ['warning', 'buttons[0].colour'],
        ],
      );
    });

    it('warns on keys that do not apply, and on icons that are no icon at all', () => {
      const { config, issues } = parseConfig('{"buttons":[{"task":"a","cwd":"x","icon":"Not An Icon"},{"command":"b","source":"npm"}]}');
      assert.ok(config);
      assert.deepStrictEqual(
        issues.map((i) => i.path),
        ['buttons[0].cwd', 'buttons[0].icon', 'buttons[1].source'],
      );
      assert.strictEqual(config.buttons[0]?.icon, undefined);
    });

    it('warns on args outside a command button, and on run keys on one', () => {
      const { config, issues } = parseConfig('{"buttons":[{"command":"a","args":1},{"vscode":"b","cwd":"x","source":"npm"},{"group":"g","buttons":[],"args":1}]}');
      assert.ok(config);
      assert.deepStrictEqual(
        issues.map((i) => [i.severity, i.path]),
        [
          ['warning', 'buttons[0].args'],
          ['warning', 'buttons[1].source'],
          ['warning', 'buttons[1].cwd'],
          ['warning', 'buttons[2].args'],
        ],
      );
      assert.ok(!('args' in config.buttons[0]!));
    });

    it('accepts Codicon, image path and emoji icons without a warning', () => {
      const { config, issues } = parseConfig('{"buttons":[{"task":"a","icon":"tools"},{"task":"b","icon":"./icons/b.svg"},{"task":"c","icon":"🚀"}]}');
      assert.deepStrictEqual(issues, []);
      assert.deepStrictEqual(
        config?.buttons.map((b) => b.icon),
        ['tools', './icons/b.svg', '🚀'],
      );
    });

    it('warns on an unknown Codicon name when the list is known, and keeps the icon', () => {
      const { config, issues } = parseConfig('{"buttons":[{"task":"a","icon":"nope"},{"task":"b","icon":"tools"}]}', { codicons: new Set(['tools']) });
      assert.deepStrictEqual(
        issues.map((i) => [i.severity, i.path]),
        [['warning', 'buttons[0].icon']],
      );
      assert.strictEqual(config?.buttons[0]?.icon, 'nope');
    });
  });
});
