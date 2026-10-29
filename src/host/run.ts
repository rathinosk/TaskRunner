import * as vscode from 'vscode';
import { shellButtonOf, type GridButton, type ShellButton } from './buttons';
import { openConfig } from './configSource';
import { SHELL_TASK_TYPE, type RunTracker } from './runTracker';
import { runTaskById } from './taskSource';

/**
 * A shell command as a real task (not terminal.sendText), so it gets the same terminal
 * reuse, kill and end-state events as tasks from tasks.json. `${...}` variables in the
 * command, cwd and env are resolved by the task system.
 */
export function shellTask(button: ShellButton): vscode.Task {
  const folders = vscode.workspace.workspaceFolders;
  const scope = folders?.find((f) => f.name === button.folder) ?? folders?.[0] ?? vscode.TaskScope.Workspace;
  const options: vscode.ShellExecutionOptions = {
    ...(button.cwd !== undefined ? { cwd: button.cwd } : {}),
    ...(button.env !== undefined ? { env: button.env } : {}),
    ...(button.shell !== undefined ? { executable: button.shell } : {}),
  };
  return new vscode.Task(
    { type: SHELL_TASK_TYPE, id: button.id },
    scope,
    button.label,
    'Task Runner',
    new vscode.ShellExecution(button.command, options),
    [],
  );
}

export function runShellButton(button: ShellButton): Thenable<vscode.TaskExecution> {
  return vscode.tasks.executeTask(shellTask(button));
}

/** As a keybinding runs it: `args`, when given, is the one argument (ADR-0007). */
async function runCommandButton(button: GridButton): Promise<void> {
  const { id, args } = button.vscodeCommand!;
  try {
    await vscode.commands.executeCommand(id, ...(args !== undefined ? [args] : []));
  } catch (e) {
    void vscode.window.showErrorMessage(`Task Runner: "${button.label}" failed (command ${id}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * What a click on a grid button does: explain a broken one; for a running one, show its terminal
 * (or restart it on Ctrl/Cmd+click); else ask first when `confirm`, then run.
 */
export async function runButton(button: GridButton, opts: { restart: boolean } = { restart: false }, runs?: RunTracker): Promise<void> {
  if (button.kind === 'group') return;
  if (button.state === 'missing') {
    const open = 'Open taskrunner.json';
    const pick = await vscode.window.showWarningMessage(`Task Runner: ${button.tooltip}`, open);
    if (pick === open) await openConfig(button.folder);
    return;
  }
  if (button.state === 'untrusted') {
    void vscode.window.showWarningMessage('Task Runner: trust this workspace to run its buttons.');
    return;
  }
  if (runs?.isRunning(button)) {
    if (!opts.restart) return runs.focusTerminal(button);
    await runs.terminate(button);
  }
  if (button.confirm) {
    const run = 'Run';
    const detail = button.shell ? button.shell.command : button.vscodeCommand ? button.vscodeCommand.id : button.label;
    const pick = await vscode.window.showWarningMessage(`Run "${button.label}"?`, { modal: true, detail }, run);
    if (pick !== run) return;
  }
  const shell = shellButtonOf(button);
  if (shell) await runShellButton(shell);
  else if (button.vscodeCommand) await runCommandButton(button);
  else if (button.taskId) await runTaskById(button.taskId);
}
