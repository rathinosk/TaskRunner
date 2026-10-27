// Webview script, bundled by esbuild into media/webview.js. Holds no state beyond the
// last `state` message; the host re-sends it on `ready` and on view show.
import { parseHostMessage, type ButtonView, type ErrorView, type HostToWebview, type IconView, type WebviewToHost } from '../core/protocol';
import type { RunStatus } from '../core/runState';
import type { GridSettings } from '../core/settings';
import { dropPosition, planAppend, planMove, type MovePlan } from './dnd';
import { nextIndex } from './grid';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const grid = document.querySelector<HTMLElement>('.tr-grid')!;
const empty = document.querySelector<HTMLElement>('.tr-empty')!;
const banner = document.querySelector<HTMLElement>('.tr-banner')!;
const nav = document.querySelector<HTMLElement>('.tr-nav')!;
const live = document.querySelector<HTMLElement>('.tr-live')!;

/** Run status of each button at the last render, to announce only what changed. */
let lastRuns = new Map<string, RunStatus>();

/** The last state from the host; the grid shows one level of it, the group `current` (null: the top). */
let last: HostToWebview | undefined;
let current: string | null = readSavedGroup();

function readSavedGroup(): string | null {
  const saved = vscode.getState();
  const group = typeof saved === 'object' && saved !== null ? (saved as { group?: unknown }).group : undefined;
  return typeof group === 'string' ? group : null;
}

function visible(): ButtonView[] {
  return (last?.buttons ?? []).filter((b) => (b.parent ?? null) === current);
}

/** Show another group (null: the top) and tell the host, so Add lands there. */
function openGroup(id: string | null): void {
  current = id;
  vscode.setState({ group: id });
  vscode.postMessage({ type: 'location', group: id });
  rerender();
}

function buttons(): HTMLButtonElement[] {
  return Array.from(grid.querySelectorAll<HTMLButtonElement>('button.tr-btn'));
}

function columns(): number {
  return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
}

/** Make `index` the grid's single tab stop. */
function setTabStop(index: number, focus: boolean): void {
  buttons().forEach((b, i) => {
    b.tabIndex = i === index ? 0 : -1;
    if (i === index && focus) b.focus();
  });
}

function action(label: string, type: 'pickTasks' | 'createConfig'): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tr-action';
  b.textContent = label;
  b.addEventListener('click', () => vscode.postMessage({ type }));
  return b;
}

/** No buttons: say why (no config yet, or an empty list) and, for no config, offer the two ways to start. */
function renderEmpty(needsConfig: boolean, hasButtons: boolean): void {
  empty.hidden = hasButtons;
  if (hasButtons) return;
  const text = document.createElement('p');
  const first = needsConfig && current === null;
  text.textContent = first ? 'No buttons yet. Choose which tasks to show, or start from an example.' : current === null ? 'No buttons.' : 'This group is empty.';
  empty.replaceChildren(text, ...(first ? [action('Pick tasks', 'pickTasks'), action('Create config', 'createConfig')] : [action('Add...', 'add')]));
}

/** Back and the path to the open group; every part but the last is a place to go, and to drop onto. */
function renderNav(): void {
  const chain: ButtonView[] = [];
  const byId = new Map((last?.buttons ?? []).map((b) => [b.id, b] as const));
  for (let id = current; id !== null; ) {
    const b = byId.get(id);
    if (!b) break;
    chain.unshift(b);
    id = b.parent ?? null;
  }
  nav.hidden = chain.length === 0;
  if (chain.length === 0) return;
  const up = chain.length > 1 ? chain[chain.length - 2]!.id : null;
  const crumb = (label: string, group: string | null, title: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'tr-crumb';
    b.dataset.group = group ?? '';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', () => openGroup(group));
    return b;
  };
  const back = document.createElement('button');
  back.className = 'tr-crumb tr-back codicon codicon-arrow-left';
  back.title = 'Back';
  back.setAttribute('aria-label', 'Back');
  back.dataset.group = up ?? '';
  back.addEventListener('click', () => openGroup(up));
  const parts: Node[] = [back, crumb('Top', null, 'Go to the top')];
  chain.forEach((b, i) => {
    parts.push(document.createTextNode(' / '));
    if (i < chain.length - 1) parts.push(crumb(b.label, b.id, `Go to ${b.label}`));
    else {
      const here = document.createElement('span');
      here.className = 'tr-here';
      here.textContent = b.label;
      here.setAttribute('aria-current', 'location');
      parts.push(here);
    }
  });
  nav.replaceChildren(...parts);
}

function renderErrors(errors: ErrorView[]): void {
  banner.hidden = errors.length === 0;
  const title = document.createElement('p');
  title.className = 'tr-banner-title';
  title.textContent = 'taskrunner.json has errors. Showing the last good buttons.';
  const list = errors.map((e, index) => {
    const link = document.createElement('button');
    link.className = 'tr-link';
    link.textContent = e.where;
    link.title = 'Open the file at this line';
    link.addEventListener('click', () => vscode.postMessage({ type: 'openError', index }));
    const row = document.createElement('div');
    row.append(link, ` ${e.message}`);
    return row;
  });
  banner.replaceChildren(title, ...list);
}

const STATUS_TEXT: Record<RunStatus, string> = { idle: '', running: 'running', passed: 'passed', failed: 'failed' };
const BADGE: Record<RunStatus, string> = { idle: '', running: 'loading codicon-modifier-spin', passed: 'check', failed: 'error' };

function iconElement(icon: IconView, fallbackNote: (note: string) => void): HTMLElement {
  if (icon.kind === 'image') {
    const img = document.createElement('img');
    img.className = 'tr-icon tr-icon-image';
    img.alt = '';
    img.draggable = false;
    img.src = icon.src;
    img.addEventListener('error', () => {
      const ph = document.createElement('span');
      ph.className = 'tr-icon codicon codicon-question';
      ph.setAttribute('aria-hidden', 'true');
      img.replaceWith(ph);
      fallbackNote('The icon file could not be loaded.');
    });
    return img;
  }
  const el = document.createElement('span');
  el.setAttribute('aria-hidden', 'true');
  if (icon.kind === 'text') {
    el.className = 'tr-icon tr-icon-text';
    el.textContent = icon.text;
  } else {
    el.className = `tr-icon codicon codicon-${icon.name}`;
  }
  return el;
}

function applySettings(s: GridSettings): void {
  document.documentElement.style.setProperty('--tr-size', `${s.iconSize}px`);
  document.body.classList.toggle('tr-no-labels', !s.showLabels);
  grid.style.gridTemplateColumns = s.columns === 'auto' ? '' : `repeat(${s.columns}, minmax(0, 1fr))`;
}

/** Announce buttons whose run just ended; a first render announces nothing. */
function announce(views: ButtonView[]): void {
  const next = new Map(views.map((v) => [v.id, v.run] as const));
  const done = views.filter((v) => (v.run === 'passed' || v.run === 'failed') && lastRuns.get(v.id) === 'running');
  if (done.length > 0) live.textContent = done.map((v) => `${v.label} ${STATUS_TEXT[v.run]}`).join('. ');
  lastRuns = next;
}

function render(views: ButtonView[]): void {
  const focusedId = (document.activeElement as HTMLElement | null)?.dataset.id;
  const stopId = buttons().find((b) => b.tabIndex === 0)?.dataset.id;
  grid.replaceChildren(
    ...views.map((v) => {
      const btn = document.createElement('button');
      btn.className = 'tr-btn';
      btn.dataset.id = v.id;
      // The full label leads the tooltip, since the text under the icon wraps and truncates.
      const setTitle = (note = ''): void => {
        btn.title = [v.label, v.tooltip, note].filter(Boolean).join('\n');
        btn.setAttribute('aria-description', [v.tooltip, note].filter(Boolean).join(' '));
      };
      setTitle();
      const status = v.state === 'ok' ? v.run : 'idle';
      const kind = v.group ? `${v.label}, group` : v.label;
      btn.setAttribute('aria-label', STATUS_TEXT[status] ? `${kind}, ${STATUS_TEXT[status]}` : kind);
      if (v.group) btn.classList.add('tr-group');
      // The editing commands in package.json's webview/context menu read this.
      btn.setAttribute('data-vscode-context', JSON.stringify({ webviewSection: 'button', buttonId: v.id, isGroup: v.group === true, preventDefaultContextMenuItems: true }));
      if (v.state !== 'ok') btn.classList.add(`tr-${v.state}`);
      if (status !== 'idle') btn.classList.add(`tr-run-${status}`);
      if (status === 'running') btn.setAttribute('aria-busy', 'true');
      const icon = iconElement(v.icon, setTitle);
      const label = document.createElement('span');
      label.className = 'tr-label';
      label.textContent = v.label;
      btn.append(icon, label);
      if (v.group) {
        const chevron = document.createElement('span');
        chevron.className = 'tr-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        btn.append(chevron);
      }
      if (status !== 'idle') {
        const badge = document.createElement('span');
        badge.className = `tr-badge codicon codicon-${BADGE[status]}`;
        badge.setAttribute('aria-hidden', 'true');
        btn.append(badge);
      }
      return btn;
    }),
  );
  const keep = views.findIndex((v) => v.id === (focusedId ?? stopId));
  setTabStop(Math.max(0, keep), focusedId !== undefined && keep >= 0);
}

grid.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.tr-btn');
  if (!btn?.dataset.id) return;
  if (suppressClick) {
    e.preventDefault();
    return;
  }
  setTabStop(buttons().indexOf(btn), false);
  const view = visible().find((v) => v.id === btn.dataset.id);
  if (view?.group) openGroup(view.id);
  else vscode.postMessage({ type: 'run', id: btn.dataset.id, restart: e.ctrlKey || e.metaKey });
});

const NUDGE: Record<string, -1 | 1 | undefined> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

function parentOf(id: string): string | null {
  return last?.buttons.find((b) => b.id === id)?.parent ?? null;
}

grid.addEventListener('keydown', (e) => {
  const all = buttons();
  const index = all.indexOf(e.target as HTMLButtonElement);
  if (index < 0) return;
  const delta = e.altKey ? NUDGE[e.key] : undefined;
  if (delta !== undefined) {
    // Alt+Arrow: the keyboard way to reorder; the host writes it and the grid redraws with focus kept.
    e.preventDefault();
    const id = (e.target as HTMLElement).dataset.id;
    if (id) vscode.postMessage({ type: 'nudge', id, delta });
    return;
  }
  if (e.key === 'Escape' && current !== null) {
    e.preventDefault();
    openGroup(parentOf(current));
    return;
  }
  const next = nextIndex(index, e.key, all.length, columns());
  if (next === undefined) return;
  e.preventDefault();
  setTabStop(next, true);
});

window.addEventListener('message', (e: MessageEvent<unknown>) => {
  const msg = parseHostMessage(e.data);
  if (!msg) return;
  last = msg;
  applySettings(msg.settings);
  announce(msg.buttons);
  // A group that is gone from the file (renamed id, removed) sends the view back to the top.
  if (current !== null && !msg.buttons.some((b) => b.id === current && b.group)) openGroup(null);
  else rerender();
  renderErrors(msg.errors);
});

function rerender(): void {
  if (!last) return;
  const shown = visible();
  renderNav();
  render(shown);
  renderEmpty(last.needsConfig, shown.length > 0);
}

/** Drag and drop with pointer events; the bar and the buttons are the drop targets. */
interface Drag {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  active: boolean;
  ghost?: HTMLElement;
  plan?: MovePlan;
  marked?: HTMLElement;
}
let drag: Drag | undefined;
let suppressClick = false;
const DRAG_THRESHOLD = 6;
const DROP_CLASSES = ['tr-drop-before', 'tr-drop-after', 'tr-drop-into', 'tr-drop-end'];

function clearMark(): void {
  if (!drag?.marked) return;
  drag.marked.classList.remove(...DROP_CLASSES);
  delete drag.marked;
}

function endDrag(commit: boolean): void {
  if (!drag) return;
  const d = drag;
  clearMark();
  d.ghost?.remove();
  document.body.classList.remove('tr-dragging');
  grid.querySelector(`button.tr-btn[data-id="${CSS.escape(d.id)}"]`)?.classList.remove('tr-drag-source');
  drag = undefined;
  if (!d.active) return;
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 80);
  if (commit && d.plan) vscode.postMessage({ type: 'move', id: d.id, parent: d.plan.parent, before: d.plan.before });
}

function updateDrop(d: Drag, x: number, y: number): void {
  clearMark();
  delete d.plan;
  const el = document.elementFromPoint(x, y);
  const shown = visible();
  const siblings = shown.map((v) => v.id);
  const crumb = el?.closest<HTMLElement>('.tr-crumb');
  const target = el?.closest<HTMLButtonElement>('button.tr-btn');
  if (crumb) {
    d.plan = { parent: crumb.dataset.group || null, before: null };
    d.marked = crumb;
    crumb.classList.add('tr-drop-into');
  } else if (target?.dataset.id) {
    const rect = target.getBoundingClientRect();
    const isGroup = shown.find((v) => v.id === target.dataset.id)?.group === true;
    const pos = dropPosition(x, rect.left, rect.width, isGroup);
    const plan = planMove(siblings, d.id, target.dataset.id, pos, current);
    if (plan) {
      d.plan = plan;
      d.marked = target;
      target.classList.add(`tr-drop-${pos}`);
    }
  } else if (el && grid.contains(el)) {
    const plan = planAppend(siblings, d.id, current);
    if (plan) {
      d.plan = plan;
      d.marked = grid;
      grid.classList.add('tr-drop-end');
    }
  }
}

grid.addEventListener('pointerdown', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.tr-btn');
  if (!btn?.dataset.id || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  drag = { id: btn.dataset.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false };
});

window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (e.buttons === 0) return endDrag(false);
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
    const source = grid.querySelector<HTMLElement>(`button.tr-btn[data-id="${CSS.escape(drag.id)}"]`);
    if (!source) return endDrag(false);
    drag.active = true;
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.className = `${source.className} tr-ghost`;
    ghost.removeAttribute('data-vscode-context');
    ghost.style.width = `${source.getBoundingClientRect().width}px`;
    document.body.append(ghost);
    drag.ghost = ghost;
    source.classList.add('tr-drag-source');
    document.body.classList.add('tr-dragging');
    (document.activeElement as HTMLElement | null)?.blur();
  }
  const ghost = drag.ghost!;
  ghost.style.left = `${e.clientX - ghost.offsetWidth / 2}px`;
  ghost.style.top = `${e.clientY - ghost.offsetHeight / 2}px`;
  updateDrop(drag, e.clientX, e.clientY);
});
window.addEventListener('pointerup', (e) => {
  if (drag && e.pointerId === drag.pointerId) endDrag(true);
});
window.addEventListener('pointercancel', () => endDrag(false));
window.addEventListener('blur', () => endDrag(false));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drag?.active) endDrag(false);
});

vscode.postMessage({ type: 'ready' });
if (current !== null) vscode.postMessage({ type: 'location', group: current });
