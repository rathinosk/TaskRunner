// Finding, reading, opening and creating .vscode/taskrunner.json in each workspace folder.
import * as vscode from 'vscode';
import { CONFIG_FILE, CONFIG_TEMPLATE, configFromTasks } from '../core/configText';
import { listTasks } from './taskSource';

export interface ConfigFile {
  folder: vscode.WorkspaceFolder;
  uri: vscode.Uri;
  /** undefined when the folder has no taskrunner.json. */
  text?: string;
}

export function configUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, '.vscode', CONFIG_FILE);
}

/** One entry per workspace folder, in folder order. */
export async function readConfigs(): Promise<ConfigFile[]> {
  return Promise.all(
    (vscode.workspace.workspaceFolders ?? []).map(async (folder) => {
      const uri = configUri(folder);
      try {
        return { folder, uri, text: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8') };
      } catch {
        return { folder, uri };
      }
    }),
  );
}

/** Show the config of a folder (the first when none is named), at a 0-based line when given. */
export async function openConfig(folderName?: string, line = 0, column = 0): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const folder = folders.find((f) => f.name === folderName) ?? folders[0];
  if (!folder) return;
  if (!(await exists(configUri(folder)))) return writeNew(folder, CONFIG_TEMPLATE);
  await openAt(configUri(folder), line, column);
}

export async function openAt(uri: vscode.Uri, line: number, column: number): Promise<void> {
  try {
    const pos = new vscode.Position(line, column);
    await vscode.window.showTextDocument(uri, { selection: new vscode.Range(pos, pos) });
  } catch {
    void vscode.window.showWarningMessage('Task Runner: this workspace has no .vscode/taskrunner.json.');
  }
}

export async function pickFolder(placeHolder = 'Create taskrunner.json in which folder?'): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showWarningMessage('Task Runner: open a folder first.');
    return undefined;
  }
  if (folders.length === 1) return folders[0];
  const pick = await vscode.window.showQuickPick(
    folders.map((f) => ({ label: f.name, folder: f })),
    { placeHolder },
  );
  return pick?.folder;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function writeNew(folder: vscode.WorkspaceFolder, text: string): Promise<void> {
  const uri = configUri(folder);
  if (await exists(uri)) {
    void vscode.window.showInformationMessage('Task Runner: taskrunner.json already exists; opening it.');
  } else {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.vscode'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
  }
  await openAt(uri, 0, 0);
}

/** Write the starter file when the folder has none, without opening it. */
export async function ensureConfig(folder: vscode.WorkspaceFolder): Promise<void> {
  const uri = configUri(folder);
  if (await exists(uri)) return;
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.vscode'));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(CONFIG_TEMPLATE, 'utf8'));
}

/** Command: write the commented starter file and open it. */
export async function createConfig(): Promise<void> {
  const folder = await pickFolder();
  if (folder) await writeNew(folder, CONFIG_TEMPLATE);
}

/** Command: pick tasks from the live list, write them as the first config. */
export async function pickTasksToConfig(): Promise<void> {
  const folder = await pickFolder();
  if (!folder) return;
  if (await exists(configUri(folder))) return writeNew(folder, '');
  const tasks = await listTasks();
  const picks = await vscode.window.showQuickPick(
    tasks.map((t) => ({ label: t.label, description: [t.source, t.folder].filter(Boolean).join(' · '), detail: t.detail, task: t })),
    { canPickMany: true, placeHolder: 'Pick the tasks to show as buttons', matchOnDescription: true },
  );
  if (!picks?.length) return;
  const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
  await writeNew(folder, configFromTasks(picks.map((p) => p.task), multiRoot));
}
