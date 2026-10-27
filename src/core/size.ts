export const MIN_ICON_SIZE = 32;
export const MAX_ICON_SIZE = 128;

/** Clamp a requested icon size to the supported 32-128 px range. */
export function clampIconSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_ICON_SIZE;
  return Math.min(MAX_ICON_SIZE, Math.max(MIN_ICON_SIZE, Math.round(size)));
}
