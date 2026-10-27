import * as vscode from 'vscode';
import { declaredLabels, orderTasks, taskId, type TaskInfo } from '../core/tasks';

function folderName(task: vscode.Task): string {
  const scope = task.scope;
  return typeof scope === 'object' && scope !== undefined ? scope.name : '';
}

function toInfo(task: vscode.Task): TaskInfo {
  const folder = folderName(task);
  return {
    id: taskId(task.source, folder, task.name),
    label: task.name,
    source: task.source,
    folder,
    group: task.group?.id,
    detail: task.detail,
  };
}

/** Read each folder's tasks.json text, only for what the API cannot say: the order as written. */
async function declaredByFolder(): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, '.vscode', 'tasks.json'));
      result.set(folder.name, declaredLabels(Buffer.from(bytes).toString('utf8')));
    } catch {
      // no tasks.json in this folder
    }
  }
  return result;
}

/** Every task VS Code knows (tasks.json and providers), ordered, as plain data. */
export async function listTasks(): Promise<TaskInfo[]> {
  const [tasks, declared] = await Promise.all([vscode.tasks.fetchTasks(), declaredByFolder()]);
  return orderTasks(tasks.map(toInfo), declared);
}

/** Resolve an id to the live vscode.Task now, never from an earlier list. */
export async function findTask(id: string): Promise<vscode.Task | undefined> {
  const tasks = await vscode.tasks.fetchTasks();
  return tasks.find((t) => taskId(t.source, folderName(t), t.name) === id);
}

async function openTasksJson(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const uri = vscode.Uri.joinPath(folder.uri, '.vscode', 'tasks.json');
  try {
    await vscode.window.showTextDocument(uri);
  } catch {
    void vscode.window.showWarningMessage('Task Runner: this workspace has no .vscode/tasks.json.');
  }
}

/** Run a task by id exactly as Run Task does. Reports "not found" with an Open tasks.json action. */
export async function runTaskById(id: string): Promise<boolean> {
  const task = await findTask(id);
  if (!task) {
    const open = 'Open tasks.json';
    void vscode.window.showErrorMessage(`Task Runner: task not found (${id.split('|').pop()}).`, open).then((pick) => {
      if (pick === open) void openTasksJson();
    });
    return false;
  }
  await vscode.tasks.executeTask(task);
  return true;
}
