// The icon picker (ADR-0004): Codicons, an SVG or PNG imported into the workspace, or an emoji.
// Imported files are copied into the workspace folder, so the config never points outside it.
import * as vscode from 'vscode';
import { ICON_DIR, iconPathFor, isIconFile, uniqueIconName } from '../core/iconFiles';
import { parseIcon } from '../core/icons';
import { knownCodicons } from './icons';

type Source = 'default' | 'codicon' | 'import' | 'emoji' | 'file';
interface SourceItem extends vscode.QuickPickItem {
  source?: Source;
  icon?: string;
}

function iconDir(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, ...ICON_DIR.split('/'));
}

/** Names of the images already in the folder's icon directory. */
async function importedIcons(folder: vscode.WorkspaceFolder): Promise<string[]> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(iconDir(folder));
    return entries.filter(([name, type]) => type === vscode.FileType.File && isIconFile(name)).map(([name]) => name).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function pickCodicon(): Promise<string | undefined> {
  const known = knownCodicons();
  if (!known) {
    const typed = await vscode.window.showInputBox({ prompt: 'Codicon name, e.g. tools, beaker, rocket' });
    return typed?.trim() || undefined;
  }
  const names = [...known].sort((a, b) => a.localeCompare(b));
  const pick = await vscode.window.showQuickPick(
    names.map((name) => ({ label: `$(${name}) ${name}`, name })),
    { placeHolder: `Search ${names.length} Codicons`, matchOnDescription: false },
  );
  return pick?.name;
}

async function importImage(folder: vscode.WorkspaceFolder): Promise<string | undefined> {
  const [source] =
    (await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Use as icon', filters: { 'SVG or PNG': ['svg', 'png'] } })) ?? [];
  if (!source) return undefined;
  const base = source.path.split('/').pop() ?? 'icon';
  if (!isIconFile(base)) {
    void vscode.window.showWarningMessage('Task Runner: an icon must be an .svg or .png file.');
    return undefined;
  }
  const dir = iconDir(folder);
  // A file already in the icon directory is used where it is, not copied onto itself.
  if (source.scheme === dir.scheme && source.path.toLowerCase().startsWith(`${dir.path.toLowerCase()}/`) && !source.path.slice(dir.path.length + 1).includes('/')) {
    return iconPathFor(source.path.slice(dir.path.length + 1));
  }
  await vscode.workspace.fs.createDirectory(dir);
  const name = uniqueIconName(base, new Set(await importedIcons(folder)));
  await vscode.workspace.fs.copy(source, vscode.Uri.joinPath(dir, name), { overwrite: false });
  return iconPathFor(name);
}

async function typeEmoji(): Promise<string | undefined> {
  const typed = await vscode.window.showInputBox({
    prompt: 'Type or paste an emoji',
    validateInput: (v) => (parseIcon(v)?.kind === 'text' ? undefined : 'An emoji or symbol: up to 12 characters, at least one non-ASCII, no spaces.'),
  });
  return typed?.trim() || undefined;
}

/**
 * Ask for an icon for a button of `folder`. Resolves to the string to write in `icon`, to '' for "use the default",
 * or to undefined when the author cancelled.
 */
export async function pickIcon(folder: vscode.WorkspaceFolder, opts: { allowDefault: boolean }): Promise<string | undefined> {
  const imported = await importedIcons(folder);
  const items: SourceItem[] = [
    ...(opts.allowDefault ? [{ label: '$(discard) Default icon', description: 'by task group, or the terminal icon', source: 'default' as const }] : []),
    { label: '$(symbol-misc) Codicon...', description: 'search the built-in icons', source: 'codicon' },
    { label: '$(file-media) Import SVG or PNG...', description: `copied to ${ICON_DIR}/`, source: 'import' },
    { label: '$(smiley) Emoji...', description: 'type or paste one', source: 'emoji' },
    ...(imported.length > 0 ? [{ label: 'Already imported', kind: vscode.QuickPickItemKind.Separator } as SourceItem] : []),
    ...imported.map((name): SourceItem => ({ label: name, source: 'file', icon: iconPathFor(name), iconPath: vscode.Uri.joinPath(iconDir(folder), name) })),
  ];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Choose an icon' });
  switch (pick?.source) {
    case 'default':
      return '';
    case 'codicon':
      return pickCodicon();
    case 'import':
      return importImage(folder);
    case 'emoji':
      return typeEmoji();
    case 'file':
      return pick.icon;
    default:
      return undefined;
  }
}
