// Task model shared by host and tests. No `vscode` import: the host maps vscode.Task to TaskInfo.
import { parseJsonc } from './jsonc';

/** Source of tasks defined in tasks.json (vscode.Task.source for those). */
export const WORKSPACE_SOURCE = 'Workspace';

export interface TaskInfo {
  /** `source|folder|name`; see taskId. */
  id: string;
  label: string;
  /** "Workspace" for tasks.json, else the provider (npm, msbuild, ...). */
  source: string;
  /** Workspace folder name; empty when there is no folder scope. */
  folder: string;
  /** "build", "test", ... when the task is in a group. */
  group?: string;
  detail?: string;
}

export function taskId(source: string, folder: string, name: string): string {
  return `${source}|${folder}|${name}`;
}

/** Split an id made by taskId. Source and folder cannot contain `|`; the name may. */
export function parseTaskId(id: string): { source: string; folder: string; name: string } | undefined {
  const a = id.indexOf('|');
  const b = a < 0 ? -1 : id.indexOf('|', a + 1);
  if (b < 0) return undefined;
  return { source: id.slice(0, a), folder: id.slice(a + 1, b), name: id.slice(b + 1) };
}

/** Labels of the tasks in a tasks.json text, in the order written. Empty when the text is unusable. */
export function declaredLabels(text: string): string[] {
  const json = parseJsonc(text);
  if (typeof json !== 'object' || json === null) return [];
  const tasks = (json as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return [];
  const labels: string[] = [];
  for (const t of tasks) {
    const label = typeof t === 'object' && t !== null ? (t as { label?: unknown }).label : undefined;
    if (typeof label === 'string') labels.push(label);
  }
  return labels;
}

/**
 * Order tasks: tasks.json tasks first, in file order per folder (unlisted ones after, by label),
 * then provider tasks by source and label.
 */
export function orderTasks(tasks: readonly TaskInfo[], declared: ReadonlyMap<string, readonly string[]>): TaskInfo[] {
  const rank = (t: TaskInfo): number => {
    const i = declared.get(t.folder)?.indexOf(t.label) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return [...tasks].sort((a, b) => {
    const aw = a.source === WORKSPACE_SOURCE;
    const bw = b.source === WORKSPACE_SOURCE;
    if (aw !== bw) return aw ? -1 : 1;
    if (aw) return cmp(a.folder, b.folder) || rank(a) - rank(b) || cmp(a.label, b.label);
    return cmp(a.source, b.source) || cmp(a.folder, b.folder) || cmp(a.label, b.label);
  });
}

/** Codicon for a task by group. */
export function iconFor(task: TaskInfo): string {
  switch (task.group) {
    case 'build':
      return 'tools';
    case 'test':
      return 'beaker';
    case 'clean':
      return 'trash';
    default:
      return 'play';
  }
}

/** Stable button id the webview can carry (its id syntax forbids `|` and spaces): FNV-1a of the task id. */
export function buttonIdFor(task: Pick<TaskInfo, 'id'>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < task.id.length; i++) {
    h ^= task.id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `t-${h.toString(16).padStart(8, '0')}`;
}
