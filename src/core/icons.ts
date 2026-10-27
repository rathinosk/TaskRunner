// Icon sources (ADR-0004): a Codicon name, a workspace-relative ./path.svg|png, or an emoji.
// An icon is data, never markup. No `vscode` import.
import { isCodiconName } from './protocol';

export type IconSpec =
  | { kind: 'codicon'; name: string }
  /** Path relative to the button's workspace folder, forward slashes, no leading "./". */
  | { kind: 'file'; path: string }
  | { kind: 'text'; text: string };

const FILE = /^\.\/([^\?#:*"<>|\0-\x1f]+)\.(svg|png)$/i;
const MAX_TEXT_CODE_POINTS = 12;

/** Classify an icon string by syntax alone; undefined when it is none of the three. */
export function parseIcon(icon: string): IconSpec | undefined {
  const value = icon.trim();
  const name = isCodiconName(value) ? value : undefined;
  if (name) return { kind: 'codicon', name };
  const file = FILE.exec(value);
  if (file) {
    const path = value.slice(2);
    return path.split('/').some((s) => s === '' || s === '.' || s === '..') ? undefined : { kind: 'file', path };
  }
  // Emoji and other symbols: short, with at least one non-ASCII character.
  const points = Array.from(value);
  if (points.length >= 1 && points.length <= MAX_TEXT_CODE_POINTS && /[^\x00-\x7f]/.test(value) && !/[\p{Cc}\p{Z}]/u.test(value.replace(/‍/g, ''))) {
    return { kind: 'text', text: value };
  }
  return undefined;
}

/** Names of the Codicons a codicon.css defines (`.codicon-name:before`), aliases included. */
export function codiconNames(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/\.codicon-([a-z0-9-]+)::?before/g)) names.add(m[1]!);
  return names;
}

export const PLACEHOLDER_ICON = 'question';

export interface ResolvedIcon {
  spec: IconSpec;
  /** Why the placeholder is shown, written for the tooltip. */
  problem?: string;
}

/**
 * The icon to draw. An unknown Codicon name, or a string that is no icon at all, gives the
 * placeholder and a problem that says what is accepted. `known` is undefined when the list is unavailable.
 */
export function resolveIcon(icon: string, known: ReadonlySet<string> | undefined): ResolvedIcon {
  const spec = parseIcon(icon);
  const accepted = 'Use a Codicon name, a "./path.svg" or "./path.png" in the workspace, or an emoji.';
  if (!spec) return { spec: { kind: 'codicon', name: PLACEHOLDER_ICON }, problem: `Icon "${icon}" is not valid. ${accepted}` };
  if (spec.kind === 'codicon' && known && !known.has(spec.name)) {
    return { spec: { kind: 'codicon', name: PLACEHOLDER_ICON }, problem: `Icon "${icon}" is not a known Codicon. ${accepted}` };
  }
  return { spec };
}
