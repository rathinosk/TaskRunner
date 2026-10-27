// Icons for the grid: reads the Codicon names the extension ships and turns a button's icon
// string into what the webview may draw.
import * as vscode from 'vscode';
import { codiconNames, resolveIcon } from '../core/icons';
import type { IconView } from '../core/protocol';

let known: Set<string> | undefined;

/** The shipped Codicon names; undefined until loaded (or if media/codicons is missing). */
export function knownCodicons(): ReadonlySet<string> | undefined {
  return known;
}

export async function loadCodicons(extensionUri: vscode.Uri): Promise<void> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'media', 'codicons', 'codicon.css'));
    known = codiconNames(Buffer.from(bytes).toString('utf8'));
  } catch {
    known = undefined;
  }
}

/** The icon to draw for `icon`, and why it is a placeholder if it is. Images load from the button's workspace folder. */
export function iconView(icon: string, folder: string, webview: Pick<vscode.Webview, 'asWebviewUri'>): { view: IconView; problem?: string } {
  const { spec, problem } = resolveIcon(icon, known);
  if (spec.kind === 'codicon') return { view: { kind: 'codicon', name: spec.name }, ...(problem ? { problem } : {}) };
  if (spec.kind === 'text') return { view: { kind: 'text', text: spec.text } };
  if (!vscode.workspace.isTrusted) {
    return { view: { kind: 'codicon', name: 'lock' }, problem: `Icon "${icon}" is not loaded: this workspace is not trusted.` };
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = (folders.find((f) => f.name === folder) ?? folders[0])?.uri;
  if (!root) return { view: { kind: 'codicon', name: 'question' }, problem: `Icon "${icon}" needs a workspace folder.` };
  const uri = vscode.Uri.joinPath(root, ...spec.path.split('/'));
  return { view: { kind: 'image', src: webview.asWebviewUri(uri).toString() } };
}
