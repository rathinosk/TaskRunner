import * as assert from 'assert';
import { parseConfig, walkButtons } from '../../src/core/config';
import { addEntries, commandEntry, groupEntry, minimalEdit, moveButton, nudge, removeAt, setProperty, shellEntry, slugId, taskEntry, valueAt } from '../../src/core/edit';

const FILE = `{
  // Buttons for my project.
  "buttons": [
    // build first
    { "task": "build", "label": "Build" }, // the main one
    { "task": "test" },
    /* docs */
    { "group": "Docs", "id": "docs", "buttons": [
      { "command": "doxygen" } // inner comment
    ] },
    { "command": "echo hi", "id": "hi" }
  ]
}
`;

const labels = (text: string): string[] => {
  const { config, issues } = parseConfig(text);
  assert.deepStrictEqual(issues.filter((i) => i.severity === 'error'), []);
  return walkButtons(config!.buttons).map((b) => (b.kind === 'task' ? b.task : b.kind === 'shell' ? b.command : b.kind === 'command' ? b.vscode : `[${b.group}]`));
};

describe('core/edit', () => {
  it('adds entries at the end and keeps the comments', () => {
    const out = addEntries(FILE, ['buttons'], [taskEntry({ label: 'lint', source: 'npm', folder: 'f' }), shellEntry({ command: 'ls', label: 'List' })]);
    assert.deepStrictEqual(labels(out), ['build', 'test', '[Docs]', 'doxygen', 'echo hi', 'lint', 'ls']);
    for (const c of ['// Buttons for my project.', '// build first', '// the main one', '/* docs */', '// inner comment']) assert.ok(out.includes(c), c);
    assert.strictEqual(valueAt(out, ['buttons', 4, 'source']), 'npm');
  });

  it('adds a VS Code command button with nested args, keeping comments', () => {
    const args = { snippet: '// $0', list: [1, { a: null }] };
    const out = addEntries(FILE, ['buttons'], [commandEntry({ vscode: 'editor.action.insertSnippet', args, label: 'Todo', icon: '' }), commandEntry({ vscode: 'x.y' })]);
    assert.deepStrictEqual(labels(out), ['build', 'test', '[Docs]', 'doxygen', 'echo hi', 'editor.action.insertSnippet', 'x.y']);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(valueAt(out, ['buttons', 4]))), { vscode: 'editor.action.insertSnippet', args, label: 'Todo' });
    assert.strictEqual(valueAt(out, ['buttons', 5, 'vscode']), 'x.y');
    assert.strictEqual(valueAt(out, ['buttons', 5, 'args']), undefined);
    for (const c of ['// build first', '// the main one', '/* docs */']) assert.ok(out.includes(c), c);
  });

  it('adds into a group', () => {
    const out = addEntries(FILE, ['buttons', 2, 'buttons'], [groupEntry('Sub', 'sub')]);
    assert.deepStrictEqual(labels(out), ['build', 'test', '[Docs]', 'doxygen', '[Sub]', 'echo hi']);
  });

  it('adds to an empty file, a file without buttons and an empty list', () => {
    assert.deepStrictEqual(labels(addEntries('', ['buttons'], [shellEntry({ command: 'a' })])), ['a']);
    assert.deepStrictEqual(labels(addEntries('{}', ['buttons'], [shellEntry({ command: 'a' })])), ['a']);
    assert.deepStrictEqual(labels(addEntries('{ "buttons": [] }', ['buttons'], [shellEntry({ command: 'a' })])), ['a']);
  });

  it('removes a button, the last one included, and keeps the other comments', () => {
    const out = removeAt(FILE, ['buttons', 1]);
    assert.deepStrictEqual(labels(out), ['build', '[Docs]', 'doxygen', 'echo hi']);
    assert.ok(out.includes('// the main one') && out.includes('/* docs */'));
    const one = '{ "buttons": [ { "command": "a" } ] }';
    assert.deepStrictEqual(labels(removeAt(one, ['buttons', 0])), []);
  });

  it('renames and re-icons, and clears a property', () => {
    let out = setProperty(FILE, ['buttons', 1], 'label', 'Tests');
    out = setProperty(out, ['buttons', 1], 'icon', 'beaker');
    assert.deepStrictEqual([valueAt(out, ['buttons', 1, 'label']), valueAt(out, ['buttons', 1, 'icon'])], ['Tests', 'beaker']);
    out = setProperty(out, ['buttons', 0], 'label', undefined);
    assert.strictEqual(valueAt(out, ['buttons', 0, 'label']), undefined);
    assert.ok(out.includes('// build first'));
    assert.deepStrictEqual(labels(setProperty(FILE, ['buttons', 2], 'group', 'Documents')), ['build', 'test', '[Documents]', 'doxygen', 'echo hi']);
  });

  it('reorders within a list', () => {
    assert.deepStrictEqual(labels(moveButton(FILE, ['buttons', 3], ['buttons'], 0)), ['echo hi', 'build', 'test', '[Docs]', 'doxygen']);
    assert.deepStrictEqual(labels(moveButton(FILE, ['buttons', 0], ['buttons'])), ['test', '[Docs]', 'doxygen', 'echo hi', 'build']);
    assert.deepStrictEqual(labels(moveButton(FILE, ['buttons', 0], ['buttons'], 2)), ['test', 'build', '[Docs]', 'doxygen', 'echo hi']);
    assert.ok(moveButton(FILE, ['buttons', 0], ['buttons']).includes('// inner comment'));
  });

  it('keeps comments inside a moved button', () => {
    const out = moveButton(FILE, ['buttons', 2], ['buttons'], 0);
    assert.ok(out.includes('// inner comment'));
    assert.deepStrictEqual(labels(out), ['[Docs]', 'doxygen', 'build', 'test', 'echo hi']);
  });

  it('moves into and out of a group', () => {
    const into = moveButton(FILE, ['buttons', 0], ['buttons', 2, 'buttons']);
    assert.deepStrictEqual(labels(into), ['test', '[Docs]', 'doxygen', 'build', 'echo hi']);
    assert.strictEqual(valueAt(into, ['buttons', 1, 'buttons', 1, 'task']), 'build');
    const out = moveButton(FILE, ['buttons', 2, 'buttons', 0], ['buttons'], 0);
    assert.deepStrictEqual(labels(out), ['doxygen', 'build', 'test', '[Docs]', 'echo hi']);
    assert.ok(out.includes('// inner comment'));
  });

  it('refuses to move a group into itself', () => {
    assert.throws(() => moveButton(FILE, ['buttons', 2], ['buttons', 2, 'buttons']), /into itself/);
  });

  it('nudges one place, and not past either end', () => {
    assert.deepStrictEqual(labels(nudge(FILE, ['buttons', 0], 1)), ['test', 'build', '[Docs]', 'doxygen', 'echo hi']);
    assert.deepStrictEqual(labels(nudge(FILE, ['buttons', 1], -1)), ['test', 'build', '[Docs]', 'doxygen', 'echo hi']);
    assert.strictEqual(nudge(FILE, ['buttons', 0], -1), FILE);
    assert.strictEqual(nudge(FILE, ['buttons', 3], 1), FILE);
  });

  it('rejects an edit of something that is gone', () => {
    assert.throws(() => removeAt(FILE, ['buttons', 9]), /no longer/);
    assert.throws(() => addEntries(FILE, ['buttons', 9, 'buttons'], []), /no longer/);
    assert.throws(() => removeAt('not json', ['buttons', 0]), /fix the file/);
  });

  it('keeps tabs and CRLF', () => {
    const tabbed = '{\r\n\t"buttons": [\r\n\t\t{ "task": "a" }\r\n\t]\r\n}\r\n';
    const out = addEntries(tabbed, ['buttons'], [shellEntry({ command: 'b' })]);
    assert.ok(out.includes('\t\t{') && !/[^\r]\n/.test(out), JSON.stringify(out));
  });

  it('describes a change as one minimal replacement', () => {
    assert.deepStrictEqual(minimalEdit('abcdef', 'abXYef'), { offset: 2, length: 2, content: 'XY' });
    assert.deepStrictEqual(minimalEdit('abc', 'abc'), { offset: 3, length: 0, content: '' });
    assert.deepStrictEqual(minimalEdit('abc', 'abxc'), { offset: 2, length: 0, content: 'x' });
  });

  it('makes group ids from names, avoiding taken ones', () => {
    assert.strictEqual(slugId('Release Notes!', new Set()), 'release-notes');
    assert.strictEqual(slugId('Docs', new Set(['docs', 'docs-2'])), 'docs-3');
    assert.strictEqual(slugId('???', new Set()), 'group');
  });
});
