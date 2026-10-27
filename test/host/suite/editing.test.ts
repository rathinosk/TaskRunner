import * as assert from 'assert';
import * as vscode from 'vscode';
import { addEntries, shellEntry } from '../../../src/core/edit';
import { editConfig, GridEditor } from '../../../src/host/editing';
import { GridViewProvider } from '../../../src/host/gridView';
import { GridModel } from '../../../src/host/model';

const folder = () => vscode.workspace.workspaceFolders![0]!;
const configUri = () => vscode.Uri.joinPath(folder().uri, '.vscode', 'taskrunner.json');
const write = (text: string) => vscode.workspace.fs.writeFile(configUri(), Buffer.from(text, 'utf8'));
const read = async () => Buffer.from(await vscode.workspace.fs.readFile(configUri())).toString('utf8');
const remove = () => Promise.resolve(vscode.workspace.fs.delete(configUri())).catch(() => undefined);

const FILE = `{
  // mine
  "buttons": [
    { "command": "echo a", "id": "a" }, // first
    { "command": "echo b", "id": "b" },
    { "group": "G", "id": "g", "buttons": [
      { "command": "echo c", "id": "c" }
    ] },
    { "command": "echo d", "id": "d" }
  ]
}
`;

/** Wait until the open document shows what is on disk (it follows file changes asynchronously). */
async function documentShows(text: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await vscode.workspace.openTextDocument(configUri())).getText() === text) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail('the editor did not pick up the file change');
}

describe('host/editing', () => {
  async function setup(text = FILE) {
    await write(text);
    await documentShows(text);
    const grid = new GridViewProvider(vscode.Uri.file('/ext'));
    const model = new GridModel(grid);
    await model.refresh();
    return { grid, model, editor: new GridEditor(grid) };
  }
  const ids = async (): Promise<string[]> => {
    const { grid, model } = await setup(await read());
    model.dispose();
    return grid.allButtons().map((b) => b.id);
  };

  beforeEach(async () => {
    await remove();
  });
  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await remove();
  });

  it('writes an edit back with the comments intact, and saves', async () => {
    const { model } = await setup();
    assert.ok(await editConfig(folder(), (t) => addEntries(t, ['buttons'], [shellEntry({ command: 'echo e' })])));
    model.dispose();
    const text = await read();
    assert.ok(text.includes('// mine') && text.includes('// first'));
    assert.deepStrictEqual(await ids(), ['a', 'b', 'g', 'c', 'd', text.includes('"echo e"') ? (await ids())[5] : 'missing']);
    assert.strictEqual((await vscode.workspace.openTextDocument(configUri())).isDirty, false);
  });

  it('reorders by dropping before a sibling and into a group', async () => {
    const { editor, model } = await setup();
    await editor.move('d', null, 'a');
    assert.deepStrictEqual(await ids(), ['d', 'a', 'b', 'g', 'c']);
    await documentShows(await read());
    const again = await setup(await read());
    await again.editor.move('a', 'g', null);
    model.dispose();
    again.model.dispose();
    assert.deepStrictEqual(await ids(), ['d', 'b', 'g', 'c', 'a']);
    assert.ok((await read()).includes('// mine'));
  });

  it('nudges one place with Alt+Arrow', async () => {
    const { editor, model } = await setup();
    await editor.nudge('b', -1);
    model.dispose();
    assert.deepStrictEqual(await ids(), ['b', 'a', 'g', 'c', 'd']);
  });

  it('removes a button, down to an empty list', async () => {
    const { editor, model } = await setup('{ "buttons": [ { "command": "echo a", "id": "a" } ] }');
    await editor.remove({ buttonId: 'a' });
    model.dispose();
    const { grid, model: after } = await setup(await read());
    after.dispose();
    assert.deepStrictEqual(grid.allButtons(), []);
  });

  it('refuses an edit meant for a button that has moved since the grid was drawn (the file wins)', async () => {
    const { editor, model } = await setup();
    const changed = FILE.replace('echo a', 'echo z').replace('"a"', '"z"');
    await write(changed);
    await documentShows(changed);
    await editor.remove({ buttonId: 'a' });
    model.dispose();
    assert.strictEqual(await read(), changed);
  });

  it('refuses to edit a file with errors', async () => {
    const { editor, model } = await setup();
    const broken = '{ "buttons": [ { "task": } ] }';
    await write(broken);
    await documentShows(broken);
    await editor.nudge('a', 1);
    model.dispose();
    assert.strictEqual(await read(), broken);
  });

  it('adds to the group the webview says it is showing, and falls back to the top when it is gone', async () => {
    const { grid, model } = await setup();
    const webview = { postMessage: () => Promise.resolve(true), asWebviewUri: (u: vscode.Uri) => u };
    assert.strictEqual(grid.location?.id as string | undefined, undefined);
    grid.onMessage(webview, { type: 'location', group: 'g' });
    assert.strictEqual(grid.location?.id, 'g');
    grid.onMessage(webview, { type: 'location', group: 'a' });
    assert.strictEqual(grid.location?.id as string | undefined, undefined, 'a plain button is not a place to add to');
    const seen: unknown[] = [];
    grid.setHandlers({ add: () => seen.push('add'), move: (...a) => seen.push(a), nudge: (...a) => seen.push(a) });
    grid.onMessage(webview, { type: 'add' });
    grid.onMessage(webview, { type: 'move', id: 'a', parent: null, before: 'b' });
    grid.onMessage(webview, { type: 'nudge', id: 'a', delta: 1 });
    model.dispose();
    assert.deepStrictEqual(seen, ['add', ['a', null, 'b'], ['a', 1]]);
  });

  it('ignores a move across folders or into something that is not a group', async () => {
    const { editor, model } = await setup();
    await editor.move('a', 'b', null);
    await editor.move('a', null, 'nope');
    model.dispose();
    assert.strictEqual(await read(), FILE);
  });
});
