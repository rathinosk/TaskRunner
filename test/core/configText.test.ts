import * as assert from 'assert';
import { parseConfig } from '../../src/core/config';
import { CONFIG_TEMPLATE, configFromTasks, taskValuePrefix, valuePrefix } from '../../src/core/configText';

describe('core/configText', () => {
  it('the starter template is a valid, empty config', () => {
    const { config, issues } = parseConfig(CONFIG_TEMPLATE);
    assert.deepStrictEqual(issues, []);
    assert.deepStrictEqual(config, { buttons: [] });
  });

  it('writes picked tasks as buttons that parse back', () => {
    const text = configFromTasks([
      { label: 'build "all"', source: 'Workspace', folder: 'f' },
      { label: 'lint', source: 'npm', folder: 'f' },
    ]);
    const { config, issues } = parseConfig(text);
    assert.deepStrictEqual(issues, []);
    assert.deepStrictEqual(
      config?.buttons.map((b) => b.kind === 'task' && [b.task, b.source]),
      [
        ['build "all"', undefined],
        ['lint', 'npm'],
      ],
    );
  });

  it('adds the folder only in a multi-root workspace', () => {
    const t = [{ label: 'a', source: 'Workspace', folder: 'f' }];
    assert.doesNotMatch(configFromTasks(t), /folder/);
    assert.match(configFromTasks(t, true), /"folder": "f"/);
  });

  it('writes a valid file for no tasks', () => {
    assert.deepStrictEqual(parseConfig(configFromTasks([])).config, { buttons: [] });
  });

  it('finds what is typed inside a "task" value', () => {
    assert.strictEqual(taskValuePrefix('    { "task": "bu'), 'bu');
    assert.strictEqual(taskValuePrefix('{"task":"'), '');
    assert.strictEqual(taskValuePrefix('{ "task" : "a \\" b'), 'a \\" b');
    assert.strictEqual(taskValuePrefix('{ "task": "done", "label": "x'), undefined);
    assert.strictEqual(taskValuePrefix('{ "command": "ta'), undefined);
    assert.strictEqual(taskValuePrefix('{ "task": '), undefined);
  });

  it('finds what is typed inside any key\'s value', () => {
    assert.strictEqual(valuePrefix('    { "vscode": "workbench.', 'vscode'), 'workbench.');
    assert.strictEqual(valuePrefix('{"vscode":"', 'vscode'), '');
    assert.strictEqual(valuePrefix('{ "task": "wo', 'vscode'), undefined);
    assert.strictEqual(valuePrefix('{ "vscode": "a", "label": "x', 'vscode'), undefined);
  });
});
