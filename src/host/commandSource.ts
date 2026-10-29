// The VS Code commands a command button may name (ADR-0007), with titles where an extension gives one.
import * as vscode from 'vscode';

interface Contributed {
  command?: unknown;
  title?: unknown;
  category?: unknown;
}

/** A title from package.json: a string, or `{ value }` when localised. */
function textOf(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && typeof (v as { value?: unknown }).value === 'string') return (v as { value: string }).value;
  return undefined;
}

/**
 * Every registered command, plus those contributed by extensions that have not activated yet (running one
 * activates its extension). Titles come from the contributions, as `Category: Title`; built-in commands have none.
 */
export async function listCommands(): Promise<Map<string, string | undefined>> {
  const commands = new Map<string, string | undefined>();
  for (const id of await vscode.commands.getCommands(true)) commands.set(id, undefined);
  for (const ext of vscode.extensions.all) {
    const list: unknown = ext.packageJSON?.contributes?.commands;
    for (const c of Array.isArray(list) ? (list as Contributed[]) : []) {
      if (typeof c.command !== 'string') continue;
      const title = textOf(c.title);
      const category = textOf(c.category);
      commands.set(c.command, title && category ? `${category}: ${title}` : title);
    }
  }
  return commands;
}
