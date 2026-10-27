// Naming for icon files imported into the workspace (ADR-0004, Phase 5). No `vscode` import.

/** Imported icons are copied here, inside the workspace folder, so the config never points outside it. */
export const ICON_DIR = '.vscode/taskrunner-icons';

/** The icon string to write for a file in ICON_DIR. */
export function iconPathFor(fileName: string): string {
  return `./${ICON_DIR}/${fileName}`;
}

/** A file name the icon syntax accepts: no path, no characters the config rule rejects. Keeps the extension. */
export function safeIconName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9 _()+-]+/g, '-').replace(/^[-. ]+|[-. ]+$/g, '') || 'icon';
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  return `${stem.slice(0, 80)}.${ext}`;
}

/** The name to save under: the safe name, with `-2`, `-3`, ... before the extension on a clash. */
export function uniqueIconName(name: string, taken: ReadonlySet<string>): string {
  const safe = safeIconName(name);
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(safe.toLowerCase())) return safe;
  const dot = safe.lastIndexOf('.');
  const stem = safe.slice(0, dot);
  const ext = safe.slice(dot);
  for (let n = 2; ; n++) {
    const next = `${stem}-${n}${ext}`;
    if (!lower.has(next.toLowerCase())) return next;
  }
}

/** Is this an image the icon rules accept (.svg or .png)? */
export function isIconFile(name: string): boolean {
  return /\.(svg|png)$/i.test(name);
}
