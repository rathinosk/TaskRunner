// Turns the config files and the live task list into what the grid shows, and keeps the last good
// grid when a config has an error.
import * as vscode from 'vscode';
import { parseConfig, type ConfigIssue } from '../core/config';
import { CONFIG_FILE } from '../core/configText';
import { mergeButtons, type FolderConfig } from '../core/merge';
import type { ErrorView } from '../core/protocol';
import { listCommands } from './commandSource';
import { openAt, readConfigs } from './configSource';
import { knownCodicons } from './icons';
import type { GridState } from './gridView';
import { listTasks } from './taskSource';

const MAX_ERRORS = 10;

interface ErrorSite {
  uri: vscode.Uri;
  line: number;
  column: number;
}

export class GridModel {
  private readonly lastGood = new Map<string, FolderConfig>();
  private sites: ErrorSite[] = [];
  private generation = 0;
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('taskrunner');

  constructor(private readonly sink: { setState(state: GridState): void }) {}

  dispose(): void {
    this.diagnostics.dispose();
  }

  /** Re-read everything. A newer refresh supersedes an older one still in flight. */
  async refresh(): Promise<GridState | undefined> {
    const mine = ++this.generation;
    const [files, tasks, commands] = await Promise.all([readConfigs(), listTasks(), listCommands()]);
    if (mine !== this.generation) return undefined;

    const errors: ErrorView[] = [];
    const sites: ErrorSite[] = [];
    const multiRoot = files.length > 1;
    this.diagnostics.clear();
    for (const file of files) {
      const name = file.folder.name;
      if (file.text === undefined) {
        this.lastGood.delete(name);
        continue;
      }
      const parsed = parseConfig(file.text, { codicons: knownCodicons() });
      if (parsed.config) this.lastGood.set(name, { folder: name, buttons: parsed.config.buttons });
      this.diagnostics.set(file.uri, parsed.issues.map(toDiagnostic));
      for (const issue of parsed.issues) {
        if (issue.severity !== 'error' || errors.length >= MAX_ERRORS) continue;
        const where = `${multiRoot ? `${name}/` : ''}${CONFIG_FILE}:${issue.line + 1}`;
        errors.push({ where, message: issue.message });
        sites.push({ uri: file.uri, line: issue.line, column: issue.column });
      }
    }
    this.sites = sites;

    const configs = files.flatMap((f) => this.lastGood.get(f.folder.name) ?? []);
    const state: GridState = {
      buttons: mergeButtons(configs, tasks, { trusted: vscode.workspace.isTrusted, commands }),
      errors,
      needsConfig: files.length > 0 && files.every((f) => f.text === undefined),
    };
    this.sink.setState(state);
    return state;
  }

  /** Open the file at the error the banner shows at `index`. */
  openError(index: number): Thenable<void> | undefined {
    const site = this.sites[index];
    return site ? openAt(site.uri, site.line, site.column) : undefined;
  }
}

function toDiagnostic(issue: ConfigIssue): vscode.Diagnostic {
  const pos = new vscode.Position(issue.line, issue.column);
  const d = new vscode.Diagnostic(
    new vscode.Range(pos, pos.translate(0, 1)),
    issue.message,
    issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
  );
  d.source = 'Task Runner';
  return d;
}
