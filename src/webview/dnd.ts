// Drag and drop in the grid, as pure functions: where a drop lands, and what move it asks the host for.

export type DropPosition = 'before' | 'after' | 'into';

/**
 * Where over a button the pointer is: the left quarter is before it, the right quarter after it, the middle
 * "into" when the button is a group. A plain button splits at the middle.
 */
export function dropPosition(x: number, left: number, width: number, isGroup: boolean): DropPosition {
  const at = width > 0 ? (x - left) / width : 0.5;
  if (isGroup) return at < 0.25 ? 'before' : at > 0.75 ? 'after' : 'into';
  return at < 0.5 ? 'before' : 'after';
}

export interface MovePlan {
  /** Group to put the button in; null for the top. */
  parent: string | null;
  /** Sibling to put it before; null for last. */
  before: string | null;
}

/**
 * The move for dropping `sourceId` on `targetId`, among `siblings` (the ids shown now, in order).
 * Undefined when the drop would change nothing, or drops a button onto itself.
 */
export function planMove(siblings: readonly string[], sourceId: string, targetId: string, position: DropPosition, current: string | null): MovePlan | undefined {
  if (sourceId === targetId) return undefined;
  if (position === 'into') return { parent: targetId, before: null };
  const rest = siblings.filter((id) => id !== sourceId);
  const at = rest.indexOf(targetId);
  if (at < 0) return undefined;
  const before = rest[position === 'before' ? at : at + 1] ?? null;
  return unchanged(siblings, sourceId, before) ? undefined : { parent: current, before };
}

/** Dropping in the empty space after the last button: last in the group being shown. */
export function planAppend(siblings: readonly string[], sourceId: string, current: string | null): MovePlan | undefined {
  return unchanged(siblings, sourceId, null) ? undefined : { parent: current, before: null };
}

function unchanged(siblings: readonly string[], sourceId: string, before: string | null): boolean {
  const i = siblings.indexOf(sourceId);
  if (i < 0) return false;
  return before === null ? i === siblings.length - 1 : siblings[i + 1] === before;
}
