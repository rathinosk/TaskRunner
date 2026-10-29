import * as vscode from 'vscode';
import { taskValuePrefix, valuePrefix } from '../core/configText';
import { listCommands } from './commandSource';
import { listTasks } from './taskSource';

/** Offer the live task labels inside `"task": "|"` in taskrunner.json. */
export const taskCompletion: vscode.CompletionItemProvider = {
  async provideCompletionItems(document, position) {
    const prefix = taskValuePrefix(document.lineAt(position.line).text.slice(0, position.character));
    if (prefix === undefined) return undefined;
    const range = new vscode.Range(position.line, position.character - prefix.length, position.line, position.character);
    const seen = new Set<string>();
    const items: vscode.CompletionItem[] = [];
    for (const t of await listTasks()) {
      if (seen.has(t.label)) continue;
      seen.add(t.label);
      const item = new vscode.CompletionItem(t.label, vscode.CompletionItemKind.Value);
      item.insertText = JSON.stringify(t.label).slice(1, -1);
      item.range = range;
      item.detail = [t.source, t.folder].filter(Boolean).join(' · ');
      items.push(item);
    }
    return items;
  },
};

/** Offer the command ids inside `"vscode": "|"` in taskrunner.json. */
export const commandCompletion: vscode.CompletionItemProvider = {
  async provideCompletionItems(document, position) {
    const prefix = valuePrefix(document.lineAt(position.line).text.slice(0, position.character), 'vscode');
    if (prefix === undefined) return undefined;
    const range = new vscode.Range(position.line, position.character - prefix.length, position.line, position.character);
    const items: vscode.CompletionItem[] = [];
    for (const [id, title] of await listCommands()) {
      if (id.startsWith('_')) continue;
      const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Function);
      item.range = range;
      if (title) item.detail = title;
      items.push(item);
    }
    return items;
  },
};
