// Messages between the host and the webview. Both sides validate what they receive:
// the webview may only ask to run a button by id, never send a command string.

import { normalizeSettings, type GridSettings } from './settings';
import type { RunStatus } from './runState';

/** ok runs; missing names a task that does not exist; untrusted waits for workspace trust. */
export type ButtonState = 'ok' | 'missing' | 'untrusted';

/** How to draw an icon: a Codicon, an image the webview may load, or text (an emoji). Data, never markup. */
export type IconView =
  | { kind: 'codicon'; name: string }
  | { kind: 'image'; src: string }
  | { kind: 'text'; text: string };

/** What the webview needs to draw one button. Data only, never markup. */
export interface ButtonView {
  id: string;
  label: string;
  icon: IconView;
  /** Hover text: what a click will run, or why it cannot; ends with the last result. */
  tooltip: string;
  state: ButtonState;
  run: RunStatus;
  /** A folder of buttons: clicking opens it instead of running. */
  group?: boolean;
  /** The id of the group this button is in; absent at the top level. */
  parent?: string;
}

/** One config problem for the banner; the webview asks to open it by index. */
export interface ErrorView {
  /** Where: file and 1-based line, e.g. "taskrunner.json:12". */
  where: string;
  message: string;
}

export type HostToWebview = {
  type: 'state';
  buttons: ButtonView[];
  /** Problems in the config; the grid shows the last good buttons meanwhile. */
  errors: ErrorView[];
  /** No taskrunner.json yet: show the empty state with its two actions. */
  needsConfig: boolean;
  settings: GridSettings;
};

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'run'; id: string; /** Ctrl/Cmd+click: restart a running task. */ restart: boolean }
  | { type: 'openError'; index: number }
  | { type: 'pickTasks' }
  | { type: 'createConfig' }
  /** Add to the group the webview is showing (see `location`). */
  | { type: 'add' }
  /** The group the webview now shows (null for the top), so the host adds there. */
  | { type: 'location'; group: string | null }
  /** Drag and drop: put button `id` in group `parent` (null: the top), before sibling `before`, or last when null. */
  | { type: 'move'; id: string; parent: string | null; before: string | null }
  /** Alt+Arrow: one place earlier (-1) or later (1) among its siblings. */
  | { type: 'nudge'; id: string; delta: -1 | 1 };

const ID = /^[A-Za-z0-9_.-]{1,64}$/;
const ICON = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isButtonId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

export function isCodiconName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && ICON.test(value);
}

/** Validate a message from the webview; anything unexpected is undefined. */
export function parseWebviewMessage(msg: unknown): WebviewToHost | undefined {
  if (!isRecord(msg)) return undefined;
  if (msg.type === 'ready') return { type: 'ready' };
  if (msg.type === 'run' && isButtonId(msg.id)) return { type: 'run', id: msg.id, restart: msg.restart === true };
  if (msg.type === 'openError' && Number.isInteger(msg.index) && (msg.index as number) >= 0 && (msg.index as number) < 1000) {
    return { type: 'openError', index: msg.index as number };
  }
  if (msg.type === 'pickTasks') return { type: 'pickTasks' };
  if (msg.type === 'createConfig') return { type: 'createConfig' };
  if (msg.type === 'add') return { type: 'add' };
  if (msg.type === 'nudge' && isButtonId(msg.id) && (msg.delta === -1 || msg.delta === 1)) return { type: 'nudge', id: msg.id, delta: msg.delta };
  if (msg.type === 'location' && (msg.group === null || isButtonId(msg.group))) return { type: 'location', group: msg.group };
  if (
    msg.type === 'move' &&
    isButtonId(msg.id) &&
    (msg.parent === null || isButtonId(msg.parent)) &&
    (msg.before === null || isButtonId(msg.before))
  ) {
    return { type: 'move', id: msg.id, parent: msg.parent, before: msg.before };
  }
  return undefined;
}

/** Validate a message from the host; anything unexpected is undefined. */
export function parseHostMessage(msg: unknown): HostToWebview | undefined {
  if (!isRecord(msg) || msg.type !== 'state' || !Array.isArray(msg.buttons)) return undefined;
  const buttons: ButtonView[] = [];
  for (const b of msg.buttons) {
    if (!isRecord(b) || !isButtonId(b.id) || typeof b.label !== 'string' || typeof b.tooltip !== 'string') {
      return undefined;
    }
    const state: ButtonState = b.state === 'missing' || b.state === 'untrusted' ? b.state : 'ok';
    const run: RunStatus = b.run === 'running' || b.run === 'passed' || b.run === 'failed' ? b.run : 'idle';
    buttons.push({
      id: b.id,
      label: b.label,
      icon: parseIconView(b.icon),
      tooltip: b.tooltip,
      state,
      run,
      ...(b.group === true ? { group: true } : {}),
      ...(isButtonId(b.parent) ? { parent: b.parent } : {}),
    });
  }
  const errors: ErrorView[] = [];
  for (const e of Array.isArray(msg.errors) ? msg.errors : []) {
    if (isRecord(e) && typeof e.where === 'string' && typeof e.message === 'string') errors.push({ where: e.where, message: e.message });
  }
  return {
    type: 'state',
    buttons,
    errors,
    needsConfig: msg.needsConfig === true,
    settings: normalizeSettings(isRecord(msg.settings) ? msg.settings : {}),
  };
}

const PLACEHOLDER: IconView = { kind: 'codicon', name: 'question' };
const MAX_SRC = 2048;

function parseIconView(icon: unknown): IconView {
  if (!isRecord(icon)) return PLACEHOLDER;
  if (icon.kind === 'codicon' && isCodiconName(icon.name)) return { kind: 'codicon', name: icon.name };
  if (icon.kind === 'image' && typeof icon.src === 'string' && icon.src.length <= MAX_SRC) return { kind: 'image', src: icon.src };
  if (icon.kind === 'text' && typeof icon.text === 'string' && icon.text.length > 0 && icon.text.length <= 32) return { kind: 'text', text: icon.text };
  return PLACEHOLDER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
