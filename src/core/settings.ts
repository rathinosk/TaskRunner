// The grid settings (taskRunner.*) as the webview needs them. No `vscode` import.
import { clampIconSize } from './size';

export interface GridSettings {
  /** Icon size in px, 32-128 in steps of 8. */
  iconSize: number;
  showLabels: boolean;
  /** A fixed column count, or "auto" to fit as many as the width allows. */
  columns: number | 'auto';
}

export const DEFAULT_ICON_SIZE = 48;
export const MAX_COLUMNS = 12;
const STEP = 8;

export const DEFAULT_SETTINGS: GridSettings = { iconSize: DEFAULT_ICON_SIZE, showLabels: true, columns: 'auto' };

/** Turn whatever the settings hold into valid values; anything unusable falls back to the default. */
export function normalizeSettings(raw: { iconSize?: unknown; showLabels?: unknown; columns?: unknown }): GridSettings {
  const size = typeof raw.iconSize === 'number' && Number.isFinite(raw.iconSize) ? clampIconSize(Math.round(raw.iconSize / STEP) * STEP) : DEFAULT_ICON_SIZE;
  const showLabels = typeof raw.showLabels === 'boolean' ? raw.showLabels : true;
  return { iconSize: size, showLabels, columns: normalizeColumns(raw.columns) };
}

function normalizeColumns(value: unknown): number | 'auto' {
  const n = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_COLUMNS ? n : 'auto';
}
