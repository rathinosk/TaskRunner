// Run state per button: idle, running, passed or failed. No `vscode` import; the host feeds it
// the task events. A failed or passed result stays until that button runs again.

export type RunStatus = 'idle' | 'running' | 'passed' | 'failed';

export interface RunInfo {
  status: RunStatus;
  /** Executions of this task that have started and not ended. */
  active: number;
  /** When the last run ended (ms since epoch). */
  endedAt?: number;
  exitCode?: number;
}

export class RunBook {
  private readonly runs = new Map<string, RunInfo>();

  /** A task started. A new run clears the previous result. */
  start(key: string): void {
    const info = this.runs.get(key);
    this.runs.set(key, { status: 'running', active: (info?.active ?? 0) + 1 });
  }

  /**
   * A task ended. Exit code 0 passed, another code failed; no code (killed, or a task with no
   * process of its own, such as one that only runs others) clears the state to idle.
   */
  end(key: string, exitCode: number | undefined, now: number): void {
    const info = this.runs.get(key);
    const active = Math.max(0, (info?.active ?? 1) - 1);
    if (active > 0) {
      this.runs.set(key, { ...(info ?? { status: 'running' }), active });
    } else if (exitCode === undefined) {
      this.runs.delete(key);
    } else {
      this.runs.set(key, { status: exitCode === 0 ? 'passed' : 'failed', active: 0, endedAt: now, exitCode });
    }
  }

  get(key: string): RunInfo | undefined {
    return this.runs.get(key);
  }

  isRunning(key: string): boolean {
    return this.runs.get(key)?.status === 'running';
  }
}

/** The tooltip line for a run, or undefined when the button has not run. */
export function describeRun(info: RunInfo | undefined, locale?: string): string | undefined {
  if (!info) return undefined;
  if (info.status === 'running') return 'Running. Click to show its terminal; Ctrl+click to restart.';
  if (info.status === 'idle' || info.endedAt === undefined) return undefined;
  const at = new Date(info.endedAt).toLocaleTimeString(locale);
  return info.status === 'passed' ? `Last run passed at ${at}.` : `Last run failed (exit code ${info.exitCode}) at ${at}.`;
}
