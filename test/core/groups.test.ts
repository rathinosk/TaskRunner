import * as assert from 'assert';
import { parseConfig, walkButtons } from '../../src/core/config';
import { mergeButtons } from '../../src/core/merge';
import { parseHostMessage, parseWebviewMessage } from '../../src/core/protocol';
import { taskId, type TaskInfo } from '../../src/core/tasks';

function task(label: string): TaskInfo {
  return { id: taskId('Workspace', 'f', label), label, source: 'Workspace', folder: 'f' };
}

describe('core/config groups (ADR-0006)', () => {
  const text = `{ "buttons": [
    { "task": "a" },
    { "group": "Docs", "icon": "book", "buttons": [
      { "command": "x" },
      { "group": "Deep", "id": "deep", "buttons": [ { "task": "b" } ] }
    ] }
  ] }`;

  it('reads nested groups with paths', () => {
    const { config, issues } = parseConfig(text);
    assert.deepStrictEqual(issues, []);
    const [a, docs] = config!.buttons;
    assert.deepStrictEqual(a!.path, ['buttons', 0]);
    assert.ok(docs?.kind === 'group');
    assert.deepStrictEqual([docs.group, docs.icon, docs.path], ['Docs', 'book', ['buttons', 1]]);
    assert.deepStrictEqual(docs.buttons[1]!.path, ['buttons', 1, 'buttons', 1]);
    const deep = docs.buttons[1];
    assert.ok(deep?.kind === 'group');
    assert.deepStrictEqual(deep.buttons[0]!.path, ['buttons', 1, 'buttons', 1, 'buttons', 0]);
  });

  it('makes ids unique across the whole tree', () => {
    const dup = parseConfig('{ "buttons": [ { "task": "a", "id": "x" }, { "group": "G", "buttons": [ { "task": "b", "id": "x" } ] } ] }');
    assert.strictEqual(dup.config, undefined);
    assert.match(dup.issues[0]!.message, /Duplicate id "x"/);
    const same = parseConfig('{ "buttons": [ { "task": "a" }, { "group": "G", "buttons": [ { "task": "a" } ] } ] }').config!;
    assert.strictEqual(new Set(walkButtons(same.buttons).map((b) => b.id)).size, 3);
  });

  it('reports a group without buttons, or mixed with task or command', () => {
    for (const bad of ['{ "group": "G" }', '{ "group": "G", "buttons": 3 }', '{ "group": "G", "task": "a", "buttons": [] }', '{ "group": "", "buttons": [] }']) {
      assert.strictEqual(parseConfig(`{ "buttons": [ ${bad} ] }`).config, undefined, bad);
    }
  });

  it('points at errors inside a group', () => {
    const r = parseConfig('{ "buttons": [ { "group": "G", "buttons": [ { "task": 3 } ] } ] }');
    assert.strictEqual(r.issues[0]!.path, 'buttons[0].buttons[0].task');
  });

  it('warns about keys that do not apply to a group', () => {
    const r = parseConfig('{ "buttons": [ { "group": "G", "confirm": true, "buttons": [] } ] }');
    assert.ok(r.config);
    assert.match(r.issues[0]!.message, /does not apply to a group/);
  });
});

describe('core/merge groups', () => {
  const trusted = { trusted: true };

  it('lists a group before its children, each child naming its parent', () => {
    const cfg = parseConfig(
      '{"buttons":[{"task":"build","id":"b"},{"group":"Docs","id":"docs","buttons":[{"command":"x","id":"x"},{"group":"In","id":"in","buttons":[{"task":"test","id":"t"}]}]},{"task":"test","id":"top"}]}',
    ).config!;
    const merged = mergeButtons([{ folder: 'f', buttons: cfg.buttons }], [task('build'), task('test')], trusted);
    assert.deepStrictEqual(
      merged.map((b) => [b.id, b.kind, b.parent]),
      [
        ['b', 'task', undefined],
        ['docs', 'group', undefined],
        ['x', 'shell', 'docs'],
        ['in', 'group', 'docs'],
        ['t', 'task', 'in'],
        ['top', 'task', undefined],
      ],
    );
    const docs = merged.find((b) => b.id === 'docs')!;
    assert.deepStrictEqual([docs.label, docs.icon, docs.state, docs.path], ['Docs', 'folder', 'ok', ['buttons', 1]]);
    assert.match(docs.tooltip, /2 buttons/);
  });

  it('leaves a group usable in an untrusted workspace', () => {
    const cfg = parseConfig('{"buttons":[{"group":"G","buttons":[{"command":"x"}]}]}').config!;
    const merged = mergeButtons([{ folder: 'f', buttons: cfg.buttons }], [], { trusted: false });
    assert.deepStrictEqual(merged.map((b) => b.state), ['ok', 'untrusted']);
  });
});

describe('core/protocol editing messages', () => {
  it('accepts add, location and move, and nothing loose', () => {
    assert.deepStrictEqual(parseWebviewMessage({ type: 'add' }), { type: 'add' });
    assert.deepStrictEqual(parseWebviewMessage({ type: 'location', group: null }), { type: 'location', group: null });
    assert.deepStrictEqual(parseWebviewMessage({ type: 'location', group: 'docs' }), { type: 'location', group: 'docs' });
    assert.deepStrictEqual(parseWebviewMessage({ type: 'move', id: 'a', parent: null, before: 'b' }), { type: 'move', id: 'a', parent: null, before: 'b' });
    assert.strictEqual(parseWebviewMessage({ type: 'location', group: 'no spaces' }), undefined);
    assert.strictEqual(parseWebviewMessage({ type: 'move', id: 'a', parent: 'x' }), undefined);
    assert.strictEqual(parseWebviewMessage({ type: 'move', id: 'a b', parent: null, before: null }), undefined);
  });

  it('carries group and parent to the webview', () => {
    const base = { type: 'state', errors: [], needsConfig: false, settings: {} };
    const msg = parseHostMessage({
      ...base,
      buttons: [
        { id: 'g', label: 'G', tooltip: '', icon: { kind: 'codicon', name: 'folder' }, group: true },
        { id: 'c', label: 'C', tooltip: '', icon: {}, parent: 'g' },
      ],
    });
    assert.deepStrictEqual(msg?.buttons.map((b) => [b.group, b.parent]), [[true, undefined], [undefined, 'g']]);
  });
});
