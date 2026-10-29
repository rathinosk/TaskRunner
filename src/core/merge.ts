// Config buttons + the live task list -> what the grid shows and what a click runs.
// No `vscode` import: the host passes tasks in as TaskInfo.
import type { ButtonConfig, JsonPath } from './config';
import type { ButtonView } from './protocol';
import { iconFor, type TaskInfo } from './tasks';

export interface FolderConfig {
  /** Workspace folder name the config file belongs to. */
  folder: string;
  buttons: readonly ButtonConfig[];
}

export interface ShellSpec {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
}

export interface CommandSpec {
  id: string;
  args?: unknown;
}

export interface MergedButton extends Omit<ButtonView, 'icon' | 'run' | 'group' | 'parent'> {
  /** The icon as written (or the default); the host resolves it for display. */
  icon: string;
  kind: 'task' | 'shell' | 'command' | 'group';
  confirm: boolean;
  /** Where the button is written in its folder's taskrunner.json; edits address it by this. */
  path: JsonPath;
  /** The id as the config has it (`id` above may be renamed to stay unique across folders); edits check it. */
  configId: string;
  /** Folder of the config that listed the button; shell buttons run there. */
  folder: string;
  /** The id of the group this button is in; absent at the top level. */
  parent?: string;
  /** For `task` buttons that resolved: the task id to look up again at click time. */
  taskId?: string;
  shell?: ShellSpec;
  vscodeCommand?: CommandSpec;
}

export interface MergeOptions {
  trusted: boolean;
  /** Known VS Code command ids and their titles; when given, a command button not in it is missing. */
  commands?: ReadonlyMap<string, string | undefined>;
}

/**
 * Buttons in config order, depth first (a group, then what is in it), folders in the order given.
 * A child names its group in `parent`. A missing task stays, marked missing.
 */
export function mergeButtons(configs: readonly FolderConfig[], tasks: readonly TaskInfo[], opts: MergeOptions): MergedButton[] {
  const used = new Set<string>();
  const out: MergedButton[] = [];
  const add = (list: readonly ButtonConfig[], folder: string, parent: string | undefined): void => {
    for (const b of list) {
      const built =
        b.kind === 'task'
          ? taskButton(b, folder, tasks)
          : b.kind === 'shell'
            ? shellButton(b, folder)
            : b.kind === 'command'
              ? commandButton(b, folder, opts.commands)
              : groupButton(b, folder);
      const merged: MergedButton = { ...built, configId: b.id };
      if (!opts.trusted && b.kind !== 'group') {
        merged.state = 'untrusted';
        merged.tooltip = `${merged.tooltip}
Not run: this workspace is not trusted.`;
      }
      merged.id = uniqueId(merged.id, used);
      used.add(merged.id);
      if (parent !== undefined) merged.parent = parent;
      out.push(merged);
      if (b.kind === 'group') add(b.buttons, folder, merged.id);
    }
  };
  for (const { folder, buttons } of configs) add(buttons, folder, undefined);
  return out;
}

function groupButton(b: Extract<ButtonConfig, { kind: 'group' }>, folder: string): Omit<MergedButton, 'configId'> {
  const n = b.buttons.length;
  return {
    id: b.id,
    kind: 'group',
    confirm: false,
    path: b.path,
    folder,
    label: b.group,
    icon: b.icon ?? 'folder',
    tooltip: b.tooltip ?? `Group: ${b.group} (${n} ${n === 1 ? 'button' : 'buttons'})`,
    state: 'ok',
  };
}

function taskButton(b: Extract<ButtonConfig, { kind: 'task' }>, folder: string, tasks: readonly TaskInfo[]): Omit<MergedButton, 'configId'> {
  const found = resolveTask(b, folder, tasks);
  const base = { id: b.id, kind: 'task' as const, confirm: b.confirm, path: b.path, folder, label: b.label ?? b.task };
  if (!found) {
    const where = [b.source, b.folder].filter(Boolean).join(' · ');
    return {
      ...base,
      icon: b.icon ?? 'warning',
      tooltip: b.tooltip ?? `Task "${b.task}"${where ? ` (${where})` : ''} was not found. Check .vscode/tasks.json or taskrunner.json.`,
      state: 'missing',
    };
  }
  const where = [found.source, found.folder].filter(Boolean).join(' · ');
  return {
    ...base,
    icon: b.icon ?? iconFor(found),
    tooltip: b.tooltip ?? `Run task: ${found.label} (${where})${b.confirm ? '\nAsks before running.' : ''}`,
    state: 'ok',
    taskId: found.id,
  };
}

function shellButton(b: Extract<ButtonConfig, { kind: 'shell' }>, folder: string): Omit<MergedButton, 'configId'> {
  const shell: ShellSpec = {
    command: b.command,
    ...(b.cwd !== undefined ? { cwd: b.cwd } : {}),
    ...(b.env !== undefined ? { env: b.env } : {}),
    ...(b.shell !== undefined ? { shell: b.shell } : {}),
  };
  return {
    id: b.id,
    kind: 'shell',
    confirm: b.confirm,
    path: b.path,
    folder,
    label: b.label ?? b.command,
    icon: b.icon ?? 'terminal',
    tooltip: b.tooltip ?? `Run: ${b.command}${b.cwd ? `\nIn: ${b.cwd}` : ''}${b.confirm ? '\nAsks before running.' : ''}`,
    state: 'ok',
    shell,
  };
}

function commandButton(
  b: Extract<ButtonConfig, { kind: 'command' }>,
  folder: string,
  commands: ReadonlyMap<string, string | undefined> | undefined,
): Omit<MergedButton, 'configId'> {
  const title = commands?.get(b.vscode);
  const vscodeCommand: CommandSpec = { id: b.vscode, ...(b.args !== undefined ? { args: b.args } : {}) };
  const base = { id: b.id, kind: 'command' as const, confirm: b.confirm, path: b.path, folder, label: b.label ?? title ?? b.vscode, vscodeCommand };
  if (commands && !commands.has(b.vscode)) {
    return {
      ...base,
      icon: b.icon ?? 'warning',
      tooltip: b.tooltip ?? `Command "${b.vscode}" was not found. Check the id in taskrunner.json, or install the extension that provides it.`,
      state: 'missing',
    };
  }
  return {
    ...base,
    icon: b.icon ?? 'symbol-event',
    tooltip: b.tooltip ?? `Run command: ${title ? `${title} (${b.vscode})` : b.vscode}${b.confirm ? '\nAsks before running.' : ''}`,
    state: 'ok',
  };
}

/** Match by label, narrowed by source and folder; prefer the config's own folder. `tasks` is in display order. */
function resolveTask(b: Extract<ButtonConfig, { kind: 'task' }>, folder: string, tasks: readonly TaskInfo[]): TaskInfo | undefined {
  const matches = tasks.filter(
    (t) => t.label === b.task && (b.source === undefined || t.source === b.source) && (b.folder === undefined || t.folder === b.folder),
  );
  if (b.folder !== undefined) return matches[0];
  return matches.find((t) => t.folder === folder) ?? matches[0];
}

function uniqueId(id: string, used: ReadonlySet<string>): string {
  if (!used.has(id)) return id;
  const base = id.slice(0, 56);
  for (let n = 2; ; n++) {
    const next = `${base}-${n}`;
    if (!used.has(next)) return next;
  }
}
