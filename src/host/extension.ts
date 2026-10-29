import * as vscode from 'vscode';
import { commandCompletion, taskCompletion } from './completion';
import { createConfig, openConfig, pickTasksToConfig } from './configSource';
import { GridEditor } from './editing';
import { normalizeSettings } from '../core/settings';
import { GridViewProvider } from './gridView';
import { loadCodicons } from './icons';
import { GridModel } from './model';
import { runButton } from './run';
import { RunTracker } from './runTracker';
import { listTasks, runTaskById } from './taskSource';

const DEBOUNCE_MS = 150;

export function activate(context: vscode.ExtensionContext): void {
  const grid = new GridViewProvider(context.extensionUri);
  const model = new GridModel(grid);
  const runs = new RunTracker(() => grid.repost());
  grid.setRunTracker(runs);
  const readSettings = (): void => {
    const c = vscode.workspace.getConfiguration('taskRunner');
    grid.setSettings(normalizeSettings({ iconSize: c.get('iconSize'), showLabels: c.get('showLabels'), columns: c.get('columns') }));
  };
  readSettings();
  const editor = new GridEditor(grid);
  grid.setHandlers({
    run: (b, opts) => runButton(b, opts, runs),
    openError: (i) => model.openError(i),
    pickTasks: () => pickTasksToConfig(),
    createConfig: () => createConfig(),
    add: () => editor.add(),
    move: (id, parent, before) => editor.move(id, parent, before),
    nudge: (id, delta) => editor.nudge(id, delta),
  });

  let timer: NodeJS.Timeout | undefined;
  const refresh = async (): Promise<void> => {
    try {
      await model.refresh();
    } catch {
      // keep the last good grid
    }
  };
  const scheduleRefresh = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), DEBOUNCE_MS);
  };

  // The buttons depend on both files: taskrunner.json lists them, tasks.json says which exist.
  const watcher = vscode.workspace.createFileSystemWatcher('**/.vscode/{tasks,taskrunner}.json');
  context.subscriptions.push(
    vscode.commands.registerCommand('taskrunner.ping', () => 'pong'),
    vscode.commands.registerCommand('taskrunner.showTasks', async () => {
      const tasks = await listTasks();
      const pick = await vscode.window.showQuickPick(
        tasks.map((t) => ({
          label: t.label,
          description: [t.source, t.folder].filter(Boolean).join(' · '),
          detail: t.detail,
          id: t.id,
        })),
        { placeHolder: 'Run a task', matchOnDescription: true },
      );
      if (pick) await runTaskById(pick.id);
    }),
    vscode.commands.registerCommand('taskrunner.openConfig', () => openConfig()),
    vscode.commands.registerCommand('taskrunner.createConfig', () => createConfig()),
    vscode.commands.registerCommand('taskrunner.pickTasks', () => pickTasksToConfig()),
    vscode.commands.registerCommand('taskrunner.add', () => editor.add()),
    vscode.commands.registerCommand('taskrunner.renameButton', (arg: unknown) => editor.rename(arg)),
    vscode.commands.registerCommand('taskrunner.changeIcon', (arg: unknown) => editor.changeIcon(arg)),
    vscode.commands.registerCommand('taskrunner.editInFile', (arg: unknown) => editor.editInFile(arg)),
    vscode.commands.registerCommand('taskrunner.removeButton', (arg: unknown) => editor.remove(arg)),
    vscode.window.registerWebviewViewProvider(GridViewProvider.viewId, grid),
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', pattern: '**/.vscode/taskrunner.json' }, taskCompletion, '"'),
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', pattern: '**/.vscode/taskrunner.json' }, commandCompletion, '"'),
    watcher,
    watcher.onDidChange(scheduleRefresh),
    watcher.onDidCreate(scheduleRefresh),
    watcher.onDidDelete(scheduleRefresh),
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleRefresh),
    // Command buttons are missing until an extension that provides their command is installed.
    vscode.extensions.onDidChange(scheduleRefresh),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('taskRunner')) readSettings();
    }),
    runs,
    vscode.workspace.onDidGrantWorkspaceTrust(scheduleRefresh),
    model,
    { dispose: () => clearTimeout(timer) },
  );
  // The Codicon list lets the config check icon names; load it before the first read.
  void loadCodicons(context.extensionUri).then(refresh);
}

export function deactivate(): void {}
