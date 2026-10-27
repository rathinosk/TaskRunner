// .vscode/taskrunner.json (ADR-0003): parse, validate and normalise. No `vscode` import.
import { parseJsoncTree, positionAt, type JsonNode } from './jsonc';
import { parseIcon } from './icons';
import { isButtonId } from './protocol';

interface ButtonBase {
  /** Explicit `id`, or one derived from what the button runs; unique within the file. */
  id: string;
  label?: string;
  icon?: string;
  tooltip?: string;
  confirm: boolean;
  /** Source offset of the button object, for messages that point back at the file. */
  offset: number;
  /** Where the button sits in the file, e.g. `['buttons', 1, 'buttons', 0]`; edits address it by this. */
  path: JsonPath;
}

export type JsonPath = (string | number)[];

export interface TaskButtonConfig extends ButtonBase {
  kind: 'task';
  /** Label of the task, as in Run Task. */
  task: string;
  /** Narrows duplicates: "Workspace" for tasks.json, or a provider such as "npm". */
  source?: string;
  /** Workspace folder name, for multi-root workspaces. */
  folder?: string;
}

export interface ShellButtonConfig extends ButtonBase {
  kind: 'shell';
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  /** Shell executable, e.g. "bash". */
  shell?: string;
}

/** A folder of buttons (ADR-0006). Runs nothing; clicking it opens it. */
export interface GroupButtonConfig extends ButtonBase {
  kind: 'group';
  /** The group's name, shown under its icon. */
  group: string;
  buttons: ButtonConfig[];
}

export type RunnableButtonConfig = TaskButtonConfig | ShellButtonConfig;
export type ButtonConfig = RunnableButtonConfig | GroupButtonConfig;

/** Every button in the tree, groups before their children (the order of the file). */
export function walkButtons(buttons: readonly ButtonConfig[]): ButtonConfig[] {
  return buttons.flatMap((b) => (b.kind === 'group' ? [b, ...walkButtons(b.buttons)] : [b]));
}

export interface TaskRunnerConfig {
  buttons: ButtonConfig[];
}

export interface ConfigIssue {
  severity: 'error' | 'warning';
  message: string;
  /** Where in the file, e.g. `buttons[2].icon`. */
  path: string;
  /** 0-based. */
  line: number;
  column: number;
}

export interface ParsedConfig {
  /** Present only when there are no errors; warnings do not block it. */
  config?: TaskRunnerConfig;
  issues: ConfigIssue[];
}

export function emptyConfig(): TaskRunnerConfig {
  return { buttons: [] };
}

const BUTTON_KEYS = new Set(['id', 'group', 'buttons', 'task', 'source', 'folder', 'command', 'cwd', 'env', 'shell', 'label', 'icon', 'tooltip', 'confirm']);

/** Parse and validate the text of a taskrunner.json. */
export function parseConfig(text: string, opts: { codicons?: ReadonlySet<string> } = {}): ParsedConfig {
  const issues: ConfigIssue[] = [];
  const issue = (severity: ConfigIssue['severity'], message: string, path: string, offset: number): void => {
    issues.push({ severity, message, path, ...positionAt(text, offset) });
  };
  const hasErrors = (): boolean => issues.some((i) => i.severity === 'error');

  const tree = parseJsoncTree(text);
  if (!tree.root) {
    issue('error', tree.error?.message ?? 'Invalid JSON', '', tree.error?.offset ?? 0);
    return { issues };
  }
  if (tree.root.kind !== 'object') {
    issue('error', 'The file must contain a JSON object with a "buttons" array', '', tree.root.offset);
    return { issues };
  }

  let list: JsonNode | undefined;
  for (const p of tree.root.props) {
    if (p.key === 'buttons') list = p.value;
    else if (p.key !== '$schema') issue('warning', `Unknown property "${p.key}"`, p.key, p.keyOffset);
  }
  if (!list) {
    issue('error', 'Missing "buttons" array', '', tree.root.offset);
    return { issues };
  }
  if (list.kind !== 'array') {
    issue('error', '"buttons" must be an array', 'buttons', list.offset);
    return { issues };
  }

  const read: Read[] = [];
  const buttons = readList(list, 'buttons', ['buttons'], issue, opts.codicons, read);

  // Explicit ids first, so a derived id never takes one the author wrote. Ids are unique across the whole tree.
  const seen = new Map<string, string>();
  for (const { button, where, idOffset } of read) {
    if (idOffset === undefined) continue;
    const first = seen.get(button.id);
    if (first !== undefined) issue('error', `Duplicate id "${button.id}" (also ${first})`, `${where}.id`, idOffset);
    else seen.set(button.id, where);
  }
  for (const { button, where, idOffset } of read) {
    if (idOffset !== undefined) continue;
    const base = button.id;
    for (let n = 2; seen.has(button.id); n++) button.id = `${base}-${n}`;
    seen.set(button.id, where);
  }

  return hasErrors() ? { issues } : { config: { buttons }, issues };
}

type Report = (severity: ConfigIssue['severity'], message: string, path: string, offset: number) => void;

/** A button as read, with where it was written; the list of these covers the whole tree. */
interface Read {
  button: ButtonConfig;
  where: string;
  idOffset?: number;
}

function readList(
  list: JsonNode & { kind: 'array' },
  path: string,
  jpath: JsonPath,
  report: Report,
  codicons: ReadonlySet<string> | undefined,
  all: Read[],
): ButtonConfig[] {
  const out: ButtonConfig[] = [];
  list.items.forEach((node, index) => {
    const where = `${path}[${index}]`;
    const r = readButton(node, where, [...jpath, index], report, codicons, all);
    if (!r) return;
    all.push({ button: r.button, where, ...(r.idOffset !== undefined ? { idOffset: r.idOffset } : {}) });
    out.push(r.button);
  });
  return out;
}

function readButton(
  node: JsonNode,
  path: string,
  jpath: JsonPath,
  report: Report,
  codicons: ReadonlySet<string> | undefined,
  all: Read[],
): { button: ButtonConfig; idOffset?: number } | undefined {
  if (node.kind !== 'object') {
    report('error', 'A button must be an object', path, node.offset);
    return undefined;
  }
  const props = new Map<string, { node: JsonNode; keyOffset: number }>();
  for (const p of node.props) {
    if (!BUTTON_KEYS.has(p.key)) report('warning', `Unknown property "${p.key}"`, `${path}.${p.key}`, p.keyOffset);
    else if (props.has(p.key)) report('error', `Property "${p.key}" is repeated`, `${path}.${p.key}`, p.keyOffset);
    else props.set(p.key, { node: p.value, keyOffset: p.keyOffset });
  }

  let ok = true;
  const text = (key: string, opts: { allowEmpty?: boolean } = {}): string | undefined => {
    const p = props.get(key);
    if (!p) return undefined;
    if (p.node.kind !== 'string') {
      report('error', `"${key}" must be a string`, `${path}.${key}`, p.node.offset);
      ok = false;
      return undefined;
    }
    if (!opts.allowEmpty && p.node.value.trim() === '') {
      report('error', `"${key}" must not be empty`, `${path}.${key}`, p.node.offset);
      ok = false;
      return undefined;
    }
    return p.node.value;
  };

  const isGroup = props.has('group');
  const task = isGroup ? undefined : text('task');
  const command = isGroup ? undefined : text('command');
  if (isGroup) {
    if (props.has('task') || props.has('command')) {
      report('error', 'A button is a group, a task or a command, not more than one', path, node.offset);
      ok = false;
    }
  } else if (props.has('task') && props.has('command')) {
    report('error', 'A button has either "task" or "command", not both', path, node.offset);
    ok = false;
  } else if (!props.has('task') && !props.has('command')) {
    report('error', 'A button needs "task" (a task label), "command" (a shell command) or "group" (a folder of buttons)', path, node.offset);
    ok = false;
  }

  const taskOnly = ['source', 'folder'];
  const shellOnly = ['cwd', 'env', 'shell'];
  if (isGroup) {
    for (const key of ['source', 'folder', 'cwd', 'env', 'shell', 'confirm', 'label']) {
      const p = props.get(key);
      if (p) report('warning', `"${key}" does not apply to a group and is ignored`, `${path}.${key}`, p.keyOffset);
    }
  } else if (props.has('buttons')) {
    report('warning', '"buttons" only applies to a group and is ignored', `${path}.buttons`, props.get('buttons')!.keyOffset);
  }
  for (const key of isGroup ? [] : props.has('task') ? shellOnly : props.has('command') ? taskOnly : []) {
    const p = props.get(key);
    if (p) report('warning', `"${key}" only applies to ${props.has('task') ? '"command"' : '"task"'} buttons and is ignored`, `${path}.${key}`, p.keyOffset);
  }

  const common = {
    label: isGroup ? undefined : text('label'),
    tooltip: text('tooltip'),
    confirm: false,
    offset: node.offset,
    path: jpath,
  };
  const iconProp = props.get('icon');
  const icon = text('icon');
  const iconSpec = icon === undefined ? undefined : parseIcon(icon);
  const iconOk = iconSpec !== undefined;
  if (icon !== undefined && !iconOk) {
    report('warning', `"${icon}" is not a Codicon name, a "./path.svg|png" or an emoji; the default icon is used`, `${path}.icon`, iconProp!.node.offset);
  }
  if (iconSpec?.kind === 'codicon' && codicons && !codicons.has(iconSpec.name)) {
    report('warning', `"${iconSpec.name}" is not a known Codicon; a placeholder is shown`, `${path}.icon`, iconProp!.node.offset);
  }
  const confirm = isGroup ? undefined : props.get('confirm');
  if (confirm) {
    if (confirm.node.kind !== 'boolean') {
      report('error', '"confirm" must be true or false', `${path}.confirm`, confirm.node.offset);
      ok = false;
    } else common.confirm = confirm.node.value;
  }

  const idProp = props.get('id');
  const id = text('id');
  if (id !== undefined && !isButtonId(id)) {
    report('error', '"id" may use letters, digits, "_", "." and "-" (up to 64 characters)', `${path}.id`, idProp!.node.offset);
    ok = false;
  }

  const groupName = isGroup ? text('group') : undefined;
  let children: ButtonConfig[] = [];
  const childList = props.get('buttons');
  if (isGroup) {
    if (!childList) {
      report('error', 'A group needs a "buttons" array', path, node.offset);
      ok = false;
    } else if (childList.node.kind !== 'array') {
      report('error', '"buttons" must be an array', `${path}.buttons`, childList.node.offset);
      ok = false;
    } else children = readList(childList.node, `${path}.buttons`, [...jpath, 'buttons'], report, codicons, all);
  }

  if (!ok) return undefined;

  const base = {
    ...common,
    ...(icon !== undefined && iconOk ? { icon: icon.trim() } : {}),
  };
  let button: ButtonConfig;
  if (isGroup) {
    button = { kind: 'group', id: id ?? derivedId('group', groupName), ...base, group: groupName!, buttons: children };
  } else if (task !== undefined) {
    const source = text('source');
    const folder = text('folder');
    button = {
      kind: 'task',
      id: id ?? derivedId('task', task, source, folder),
      ...base,
      task,
      ...(source !== undefined ? { source } : {}),
      ...(folder !== undefined ? { folder } : {}),
    };
  } else {
    const cwd = text('cwd');
    const shell = text('shell');
    const env = readEnv(props.get('env'), `${path}.env`, report);
    if (env === null) return undefined;
    button = {
      kind: 'shell',
      id: id ?? derivedId('cmd', command!),
      ...base,
      command: command!,
      ...(cwd !== undefined ? { cwd } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(shell !== undefined ? { shell } : {}),
    };
  }
  return id !== undefined ? { button, idOffset: idProp!.node.offset } : { button };
}

/** undefined when absent, null when invalid (already reported). */
function readEnv(prop: { node: JsonNode } | undefined, path: string, report: Report): Record<string, string> | undefined | null {
  if (!prop) return undefined;
  if (prop.node.kind !== 'object') {
    report('error', '"env" must be an object of strings', path, prop.node.offset);
    return null;
  }
  const env: Record<string, string> = {};
  let ok = true;
  for (const p of prop.node.props) {
    if (p.value.kind !== 'string') {
      report('error', `env "${p.key}" must be a string`, `${path}.${p.key}`, p.value.offset);
      ok = false;
    } else env[p.key] = p.value.value;
  }
  return ok ? env : null;
}

/** Stable id from what the button runs (FNV-1a), so run state survives reordering. */
function derivedId(prefix: string, ...parts: (string | undefined)[]): string {
  let h = 0x811c9dc5;
  for (const ch of parts.map((p) => p ?? '').join('|')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}-${h.toString(16).padStart(8, '0')}`;
}
