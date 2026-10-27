// A button on the grid, as the host knows it. The webview only ever sees ButtonView.
import type { MergedButton } from '../core/merge';
import type { ButtonView, IconView } from '../core/protocol';
import type { RunStatus } from '../core/runState';

export type GridButton = MergedButton;

export interface ShellButton {
  id: string;
  label: string;
  icon: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  /** Shell executable; the default shell when absent. */
  shell?: string;
  /** Workspace folder name the task is scoped to (`${workspaceFolder}` resolves there). */
  folder?: string;
}

export function toView(b: GridButton, icon: IconView, run: RunStatus, tooltip: string): ButtonView {
  return { id: b.id, label: b.label, icon, tooltip, state: b.state, run, ...(b.kind === 'group' ? { group: true } : {}), ...(b.parent !== undefined ? { parent: b.parent } : {}) };
}

export function shellButtonOf(b: GridButton): ShellButton | undefined {
  if (!b.shell) return undefined;
  return { id: b.id, label: b.label, icon: b.icon, folder: b.folder, ...b.shell };
}
