// Feeds the task events into a RunBook, so a button shows busy, passed or failed whether it was
// started from the grid, from Run Task or by another extension.
import * as vscode from 'vscode';
import { RunBook, type RunInfo } from '../core/runState';
import { taskId } from '../core/tasks';
import type { GridButton } from './buttons';

const TERMINATE_WAIT_MS = 5000;

/** Shell buttons run as tasks of this type, with the button id in the definition. */
export const SHELL_TASK_TYPE = 'taskrunner';

function folderName(task: vscode.Task): string {
  const scope = task.scope;
  return typeof scope === 'object' && scope !== undefined ? scope.name : '';
}

function keyOfTask(task: vscode.Task): string {
  if (task.definition.type === SHELL_TASK_TYPE && typeof task.definition.id === 'string') return `shell|${task.definition.id}`;
  return taskId(task.source, folderName(task), task.name);
}

/** The key a button's runs are filed under; the same as keyOfTask gives for its task. */
export function keyOfButton(b: GridButton): string | undefined {
  return b.kind === 'shell' ? `shell|${b.id}` : b.taskId;
}

export class RunTracker implements vscode.Disposable {
  private readonly book = new RunBook();
  private readonly executions = new Map<string, Set<vscode.TaskExecution>>();
  private readonly exitCodes = new Map<vscode.TaskExecution, number | undefined>();
  private readonly subscriptions: vscode.Disposable[];

  constructor(private readonly onChange: () => void) {
    for (const e of vscode.tasks.taskExecutions) this.started(e);
    this.subscriptions = [
      vscode.tasks.onDidStartTask((e) => {
        this.started(e.execution);
        this.onChange();
      }),
      vscode.tasks.onDidEndTaskProcess((e) => this.exitCodes.set(e.execution, e.exitCode)),
      vscode.tasks.onDidEndTask((e) => {
        this.ended(e.execution);
        this.onChange();
      }),
    ];
  }

  dispose(): void {
    for (const s of this.subscriptions) s.dispose();
  }

  get(button: GridButton): RunInfo | undefined {
    const key = keyOfButton(button);
    return key === undefined ? undefined : this.book.get(key);
  }

  isRunning(button: GridButton): boolean {
    const key = keyOfButton(button);
    return key !== undefined && this.book.isRunning(key);
  }

  /** Bring the terminal of a running button forward (found by the task's name, else the terminal panel). */
  async focusTerminal(button: GridButton): Promise<void> {
    const key = keyOfButton(button);
    const execution = key === undefined ? undefined : [...(this.executions.get(key) ?? [])][0];
    const terminal = execution && vscode.window.terminals.find((t) => t.name === execution.task.name);
    if (terminal) terminal.show();
    else await vscode.commands.executeCommand('workbench.action.terminal.focus');
  }

  /** Stop every run of a button and wait (briefly) until they have ended. */
  async terminate(button: GridButton): Promise<void> {
    const key = keyOfButton(button);
    const running = key === undefined ? [] : [...(this.executions.get(key) ?? [])];
    if (running.length === 0) return;
    const ended = new Promise<void>((resolve) => {
      const timer = setTimeout(done, TERMINATE_WAIT_MS);
      const sub = vscode.tasks.onDidEndTask(() => {
        if (!this.executions.has(key!)) done();
      });
      function done(): void {
        clearTimeout(timer);
        sub.dispose();
        resolve();
      }
    });
    for (const e of running) e.terminate();
    await ended;
  }

  private started(execution: vscode.TaskExecution): void {
    const key = keyOfTask(execution.task);
    const set = this.executions.get(key) ?? new Set();
    if (set.has(execution)) return;
    set.add(execution);
    this.executions.set(key, set);
    this.book.start(key);
  }

  private ended(execution: vscode.TaskExecution): void {
    const key = keyOfTask(execution.task);
    const set = this.executions.get(key);
    if (!set?.delete(execution)) return;
    if (set.size === 0) this.executions.delete(key);
    this.book.end(key, this.exitCodes.get(execution), Date.now());
    this.exitCodes.delete(execution);
  }
}
