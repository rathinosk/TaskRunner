// Edits to the text of a taskrunner.json that keep the author's comments and layout (ADR-0002
// amendment: jsonc-parser does the text surgery). Every function takes the text and returns new
// text; the host turns the difference into one editor edit. No `vscode` import.
import { applyEdits, findNodeAtLocation, getNodeValue, modify, parseTree, type FormattingOptions, type Node } from 'jsonc-parser';
import type { JsonPath } from './config';
import { CONFIG_TEMPLATE } from './configText';
import type { TaskInfo } from './tasks';

/** The text cannot be edited as asked; the message is for the author. */
export class EditError extends Error {}

/** One button as written in the file; values are plain JSON. */
export type Entry = Record<string, unknown>;

const PLACEHOLDER = '__taskrunner_move__';

function formatting(text: string): FormattingOptions {
  const tabs = /^\t/m.test(text);
  return { insertSpaces: !tabs, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

function tree(text: string): Node {
  const root = parseTree(text, [], { allowTrailingComma: true });
  if (!root || root.type !== 'object') throw new EditError('taskrunner.json is not a JSON object; fix the file first.');
  return root;
}

function set(text: string, path: JsonPath, value: unknown, insert = false): string {
  const edits = modify(text, path, value, { formattingOptions: formatting(text), isArrayInsertion: insert });
  return applyEdits(text, edits);
}

function arrayAt(root: Node, path: JsonPath): Node {
  const node = findNodeAtLocation(root, path);
  if (!node || node.type !== 'array') throw new EditError('That group is no longer in the file.');
  return node;
}

/** The array a path ends in, created (as the top-level `buttons`) when the file has none yet. */
function ensureList(text: string, path: JsonPath): string {
  const root = tree(text);
  if (findNodeAtLocation(root, path)) return text;
  if (path.length === 1 && path[0] === 'buttons') return set(text, ['buttons'], []);
  throw new EditError('That group is no longer in the file.');
}

/** Append entries to the `buttons` array at `listPath` (`['buttons']` for the top, or a group's). */
export function addEntries(text: string, listPath: JsonPath, entries: readonly Entry[]): string {
  let out = ensureList(text.trim() === '' ? CONFIG_TEMPLATE : text, listPath);
  for (const entry of entries) {
    const count = arrayAt(tree(out), listPath).children?.length ?? 0;
    out = set(out, [...listPath, count], entry, true);
  }
  return out;
}

/**
 * Cut the array item at `path` out of the text and nothing else: its comma, and, when it sits on
 * its own line(s), the line break and a `// comment` after it. Neighbouring comments and layout stay.
 * Returns the new text and the comment that was cut with the item, if any.
 */
function cutItem(text: string, path: JsonPath): { text: string; comment?: string } {
  const root = tree(text);
  const node = findNodeAtLocation(root, path);
  const list = path.length > 0 ? findNodeAtLocation(root, path.slice(0, -1)) : undefined;
  const i = path[path.length - 1];
  if (!node || !list || list.type !== 'array' || typeof i !== 'number') throw new EditError('That button is no longer in the file.');
  const siblings = list.children ?? [];

  let start = node.offset;
  let end = node.offset + node.length;
  const after = /^[ \t]*(,)?/.exec(text.slice(end))!;
  const comma = after[1] !== undefined;
  end += after[0].length;

  let comment: string | undefined;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const tail = /^[ \t]*(\/\/[^\r\n]*)?(\r?\n|$)/.exec(text.slice(end));
  if (/^[ \t]*$/.test(text.slice(lineStart, start)) && tail) {
    start = lineStart;
    end += tail[0].length;
    comment = tail[1]?.replace(/^\/\/\s?/, '');
  }

  let out = text.slice(0, start) + text.slice(end);
  if (!comma && i > 0) {
    // The last item took no comma of its own; the one before it must lose its comma.
    const prev = siblings[i - 1]!;
    const prevEnd = prev.offset + prev.length;
    const found = /^[ \t]*,/.exec(out.slice(prevEnd));
    if (found) out = out.slice(0, prevEnd) + out.slice(prevEnd + found[0].length);
  }
  return { text: out, ...(comment !== undefined ? { comment } : {}) };
}

/** Remove the button written at `path`. */
export function removeAt(text: string, path: JsonPath): string {
  return cutItem(text, path).text;
}

/** Set a property of the button at `path`; `undefined` removes it. */
export function setProperty(text: string, path: JsonPath, key: string, value: string | undefined): string {
  if (!findNodeAtLocation(tree(text), path)) throw new EditError('That button is no longer in the file.');
  return set(text, [...path, key], value);
}

/** The path after an insertion at index `at` of the array `list`. */
function shifted(path: JsonPath, list: JsonPath, at: number): JsonPath {
  const n = list.length;
  const inside = path.length > n && list.every((k, i) => path[i] === k);
  const index = path[n];
  return inside && typeof index === 'number' && index >= at ? [...path.slice(0, n), index + 1, ...path.slice(n + 1)] : path;
}

function indentOf(text: string, offset: number): string {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start, offset))![0];
}

/**
 * Move the button at `from` into the array `toList`, before the item at `index` there (the end when
 * undefined). The index counts the destination as it is now. The moved text is kept as written,
 * comments inside it included, and re-indented.
 */
export function moveButton(text: string, from: JsonPath, toList: JsonPath, index?: number): string {
  const root = tree(text);
  const node = findNodeAtLocation(root, from);
  if (!node) throw new EditError('That button is no longer in the file.');
  if (toList.length >= from.length && from.every((k, i) => toList[i] === k)) throw new EditError('A group cannot be moved into itself.');
  const at = Math.min(index ?? Infinity, arrayAt(root, toList).children?.length ?? 0);

  const raw = text.slice(node.offset, node.offset + node.length);
  const oldIndent = indentOf(text, node.offset);
  let out = set(text, [...toList, at], PLACEHOLDER, true);
  const cut = cutItem(out, shifted(from, toList, at));
  out = cut.text;

  const quoted = `"${PLACEHOLDER}"`;
  const hole = out.indexOf(quoted);
  if (hole < 0) throw new EditError('The button could not be moved.');
  const eol = formatting(text).eol;
  const newIndent = indentOf(out, hole);
  const body = raw
    .split(/\r?\n/)
    .map((line, i) => (i === 0 ? line : newIndent + (line.startsWith(oldIndent) ? line.slice(oldIndent.length) : line.trimStart())))
    .join(eol);
  // A comment that trailed the item cannot trail it after the move (a comma follows), so it leads it.
  const moved = cut.comment !== undefined ? `// ${cut.comment}${eol}${newIndent}${body}` : body;
  return out.slice(0, hole) + moved + out.slice(hole + quoted.length);
}

/** Move a button one place within its array (Alt+Arrow). A move past either end changes nothing. */
export function nudge(text: string, path: JsonPath, delta: -1 | 1): string {
  const list = path.slice(0, -1);
  const i = path[path.length - 1];
  if (typeof i !== 'number') throw new EditError('That button is no longer in the file.');
  const count = arrayAt(tree(text), list).children?.length ?? 0;
  const to = i + delta;
  if (to < 0 || to >= count) return text;
  return moveButton(text, path, list, delta < 0 ? to : to + 1);
}

/** The text changed from `before` to `after` as one replacement: the smallest range that differs. */
export function minimalEdit(before: string, after: string): { offset: number; length: number; content: string } {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return { offset: start, length: endBefore - start, content: after.slice(start, endAfter) };
}

/** Entries for picked tasks, written the way the starter file writes them. */
export function taskEntry(t: Pick<TaskInfo, 'label' | 'source' | 'folder'>, multiRoot = false): Entry {
  return {
    task: t.label,
    ...(t.source !== 'Workspace' ? { source: t.source } : {}),
    ...(multiRoot && t.folder ? { folder: t.folder } : {}),
  };
}

export function shellEntry(s: { command: string; label?: string; icon?: string }): Entry {
  return { command: s.command, ...(s.label ? { label: s.label } : {}), ...(s.icon ? { icon: s.icon } : {}) };
}

export function commandEntry(c: { vscode: string; args?: unknown; label?: string; icon?: string }): Entry {
  return {
    vscode: c.vscode,
    ...(c.args !== undefined ? { args: c.args } : {}),
    ...(c.label ? { label: c.label } : {}),
    ...(c.icon ? { icon: c.icon } : {}),
  };
}

export function groupEntry(name: string, id: string, icon?: string): Entry {
  return { group: name, id, ...(icon ? { icon } : {}), buttons: [] };
}

/** An id for a new group: its name as a slug, with a number when taken. */
export function slugId(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || 'group';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Source offset of the node at `path`, or undefined when the file has no such node. */
export function offsetAt(text: string, path: JsonPath): number | undefined {
  const root = parseTree(text, [], { allowTrailingComma: true });
  return root ? findNodeAtLocation(root, path)?.offset : undefined;
}

/** The value at `path`, for tests and callers that need to read back what an edit wrote. */
export function valueAt(text: string, path: JsonPath): unknown {
  const node = findNodeAtLocation(tree(text), path);
  return node ? getNodeValue(node) : undefined;
}
