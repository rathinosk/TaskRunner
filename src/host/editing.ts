// Editing the grid from the UI. Every change is a text edit of taskrunner.json in the editor; the grid
// then follows through the file watcher like any other edit (one path, no second source of truth).
import * as vscode from 'vscode';
import { parseConfig, walkButtons, type JsonPath } from '../core/config';
import { addEntries, EditError, groupEntry, minimalEdit, moveButton, nudge, offsetAt, removeAt, setProperty, shellEntry, slugId, taskEntry } from '../core/edit';
import { isButtonId } from '../core/protocol';
import type { GridButton } from './buttons';
import { configUri, ensureConfig, pickFolder } from './configSource';
import type { GridViewProvider } from './gridView';
import { pickIcon } from './iconPicker';
import { listTasks } from './taskSource';

/** A button the edit relies on: it must still be at `path` with this config id, or the file changed under us. */
interface Expect {
  path: JsonPath;
  id: string;
}

const samePath = (a: JsonPath, b: JsonPath): boolean => a.length === b.length && a.every((k, i) => k === b[i]);
const expectOf = (b: GridButton): Expect => ({ path: b.path, id: b.configId });

function folderOf(b: GridButton): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.find((f) => f.name === b.folder) ?? folders[0];
}

/**
 * Apply `change` to the text of the folder's taskrunner.json as one editor edit (so Undo works) and save, so the
 * watcher refreshes the grid. The text is read now, not taken from the grid: if the file changed since the grid was
 * drawn, the file wins and an edit that no longer fits is refused.
 */
export async function editConfig(folder: vscode.WorkspaceFolder, change: (text: string) => string, expect: readonly Expect[] = []): Promise<boolean> {
  await ensureConfig(folder);
  const uri = configUri(folder);
  const doc = await vscode.workspace.openTextDocument(uri);
  const before = doc.getText();
  const parsed = parseConfig(before);
  if (!parsed.config) {
    void vscode.window.showWarningMessage('Task Runner: taskrunner.json has errors; fix them before editing from the grid.');
    return false;
  }
  const written = walkButtons(parsed.config.buttons);
  if (expect.some((e) => written.find((b) => samePath(b.path, e.path))?.id !== e.id)) {
    void vscode.window.showWarningMessage('Task Runner: taskrunner.json changed since the grid was drawn. The grid is refreshing; try again.');
    return false;
  }
  let after: string;
  try {
    after = change(before);
  } catch (e) {
    if (e instanceof EditError) {
      void vscode.window.showWarningMessage(`Task Runner: ${e.message}`);
      return false;
    }
    throw e;
  }
  if (after === before) return true;
  const edit = minimalEdit(before, after);
  const range = new vscode.Range(doc.positionAt(edit.offset), doc.positionAt(edit.offset + edit.length));
  const change2 = new vscode.WorkspaceEdit();
  change2.replace(uri, range, edit.content);
  const wasDirty = doc.isDirty;
  if (!(await vscode.workspace.applyEdit(change2))) {
    void vscode.window.showWarningMessage('Task Runner: the edit could not be applied to taskrunner.json.');
    return false;
  }
  if (wasDirty) void vscode.window.showInformationMessage('Task Runner: edited taskrunner.json, which has unsaved changes. Save it to update the grid.');
  else await doc.save();
  return true;
}

/** The button id in a webview context-menu argument, if it is one. */
export function buttonIdFrom(arg: unknown): string | undefined {
  const id = typeof arg === 'object' && arg !== null ? (arg as { buttonId?: unknown }).buttonId : undefined;
  return isButtonId(id) ? id : undefined;
}

export class GridEditor {
  constructor(private readonly grid: GridViewProvider) {}

  private button(id: string | undefined): GridButton | undefined {
    return id === undefined ? undefined : this.grid.findButton(id);
  }

  /** Add to the open group, or to the top: tasks (several), a shell command or a group. */
  async add(): Promise<void> {
    const group = this.grid.location;
    const folder = group ? folderOf(group) : await pickFolder('Add to which folder?');
    if (!folder) return;
    const list: JsonPath = group ? [...group.path, 'buttons'] : ['buttons'];
    const expect = group ? [expectOf(group)] : [];

    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(tasklist) Tasks...', description: 'from tasks.json and task providers', what: 'tasks' as const },
        { label: '$(terminal) Shell command...', description: 'any command line', what: 'shell' as const },
        { label: '$(folder) New group...', description: 'a folder of buttons', what: 'group' as const },
      ],
      { placeHolder: group ? `Add to ${group.label}` : 'Add to the grid' },
    );
    if (choice?.what === 'tasks') await this.addTasks(folder, list, expect);
    else if (choice?.what === 'shell') await this.addShell(folder, list, expect);
    else if (choice?.what === 'group') await this.addGroup(folder, list, expect);
  }

  private async addTasks(folder: vscode.WorkspaceFolder, list: JsonPath, expect: Expect[]): Promise<void> {
    const tasks = await listTasks();
    if (tasks.length === 0) {
      void vscode.window.showInformationMessage('Task Runner: no tasks found. Add some to .vscode/tasks.json, or add a shell command instead.');
      return;
    }
    const onGrid = new Set(this.grid.allButtons().flatMap((b) => (b.taskId ? [b.taskId] : [])));
    const picks = await vscode.window.showQuickPick(
      tasks.map((t) => ({
        label: `${onGrid.has(t.id) ? '$(check) ' : ''}${t.label}`,
        description: [t.source, t.folder].filter(Boolean).join(' · '),
        detail: [onGrid.has(t.id) ? 'Already on the grid' : '', t.detail ?? ''].filter(Boolean).join(' · ') || undefined,
        task: t,
      })),
      { canPickMany: true, placeHolder: 'Pick the tasks to add as buttons', matchOnDescription: true },
    );
    if (!picks?.length) return;
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    await editConfig(folder, (text) => addEntries(text, list, picks.map((p) => taskEntry(p.task, multiRoot))), expect);
  }

  private async addShell(folder: vscode.WorkspaceFolder, list: JsonPath, expect: Expect[]): Promise<void> {
    const command = await vscode.window.showInputBox({ prompt: 'Shell command to run', validateInput: (v) => (v.trim() ? undefined : 'Enter a command') });
    if (command === undefined) return;
    const label = await vscode.window.showInputBox({ prompt: 'Label under the icon (optional; empty uses the command)' });
    if (label === undefined) return;
    const icon = await pickIcon(folder, { allowDefault: true });
    if (icon === undefined) return;
    await editConfig(folder, (text) => addEntries(text, list, [shellEntry({ command: command.trim(), label: label.trim(), icon })]), expect);
  }

  private async addGroup(folder: vscode.WorkspaceFolder, list: JsonPath, expect: Expect[]): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'Name of the group', validateInput: (v) => (v.trim() ? undefined : 'Enter a name') });
    if (name === undefined) return;
    const icon = await pickIcon(folder, { allowDefault: true });
    if (icon === undefined) return;
    await editConfig(
      folder,
      (text) => {
        const taken = new Set(walkButtons(parseConfig(text).config?.buttons ?? []).map((b) => b.id));
        return addEntries(text, list, [groupEntry(name.trim(), slugId(name, taken), icon)]);
      },
      expect,
    );
  }

  async rename(arg: unknown): Promise<void> {
    const b = this.button(buttonIdFrom(arg));
    const folder = b && folderOf(b);
    if (!b || !folder) return;
    const isGroup = b.kind === 'group';
    const value = await vscode.window.showInputBox({
      prompt: isGroup ? 'Name of the group' : 'Label under the icon (empty goes back to the default)',
      value: b.label,
      validateInput: (v) => (isGroup && !v.trim() ? 'Enter a name' : undefined),
    });
    if (value === undefined) return;
    const text = value.trim();
    await editConfig(folder, (t) => setProperty(t, b.path, isGroup ? 'group' : 'label', text === '' ? undefined : text), [expectOf(b)]);
  }

  async changeIcon(arg: unknown): Promise<void> {
    const b = this.button(buttonIdFrom(arg));
    const folder = b && folderOf(b);
    if (!b || !folder) return;
    const icon = await pickIcon(folder, { allowDefault: true });
    if (icon === undefined) return;
    await editConfig(folder, (t) => setProperty(t, b.path, 'icon', icon === '' ? undefined : icon), [expectOf(b)]);
  }

  async remove(arg: unknown): Promise<void> {
    const b = this.button(buttonIdFrom(arg));
    const folder = b && folderOf(b);
    if (!b || !folder) return;
    const inside = this.grid.allButtons().filter((c) => c.parent === b.id).length;
    if (b.kind === 'group' && inside > 0) {
      const remove = 'Remove';
      const pick = await vscode.window.showWarningMessage(`Remove the group "${b.label}" and the ${inside} button${inside === 1 ? '' : 's'} in it?`, { modal: true }, remove);
      if (pick !== remove) return;
    }
    await editConfig(folder, (t) => removeAt(t, b.path), [expectOf(b)]);
  }

  async editInFile(arg: unknown): Promise<void> {
    const b = this.button(buttonIdFrom(arg));
    const folder = b && folderOf(b);
    if (!b || !folder) return;
    const doc = await vscode.workspace.openTextDocument(configUri(folder));
    const at = doc.positionAt(offsetAt(doc.getText(), b.path) ?? 0);
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(at, at) });
  }

  /** Drag and drop: `id` goes into group `parent` (null: the top), before sibling `before` (null: last). Within one folder's file. */
  async move(id: string, parent: string | null, before: string | null): Promise<void> {
    const b = this.button(id);
    const group = parent === null ? undefined : this.button(parent);
    const sibling = before === null ? undefined : this.button(before);
    const folder = b && folderOf(b);
    if (!b || !folder || (parent !== null && group?.kind !== 'group') || (before !== null && !sibling)) return;
    if ((group && group.folder !== b.folder) || (sibling && sibling.folder !== b.folder) || (sibling && sibling.parent !== group?.id)) {
      void vscode.window.showWarningMessage('Task Runner: a button can only move within the buttons of its own folder.');
      return;
    }
    const to: JsonPath = group ? [...group.path, 'buttons'] : ['buttons'];
    const index = sibling ? sibling.path[sibling.path.length - 1] : undefined;
    const expect = [expectOf(b), ...(group ? [expectOf(group)] : []), ...(sibling ? [expectOf(sibling)] : [])];
    await editConfig(folder, (t) => moveButton(t, b.path, to, typeof index === 'number' ? index : undefined), expect);
  }

  /** Alt+Arrow: one place earlier or later among its siblings in the file. */
  async nudge(id: string, delta: -1 | 1): Promise<void> {
    const b = this.button(id);
    const folder = b && folderOf(b);
    if (!b || !folder) return;
    await editConfig(folder, (t) => nudge(t, b.path, delta), [expectOf(b)]);
  }
}
