import * as vscode from 'vscode';
import { parseWebviewMessage, type ButtonView, type ErrorView, type HostToWebview } from '../core/protocol';
import { describeRun } from '../core/runState';
import { DEFAULT_SETTINGS, type GridSettings } from '../core/settings';
import { gridHtml, makeNonce } from '../webview/html';
import { toView, type GridButton } from './buttons';
import { iconView } from './icons';
import type { RunTracker } from './runTracker';

/** What the grid shows: the buttons, any config problems, and whether to offer creating a config. */
export interface GridState {
  buttons: readonly GridButton[];
  errors: readonly ErrorView[];
  needsConfig: boolean;
}

/** What the webview can ask for. It never sends a command, only "this button" or one of these actions. */
export interface GridHandlers {
  run(button: GridButton, opts: { restart: boolean }): unknown;
  openError(index: number): unknown;
  pickTasks(): unknown;
  createConfig(): unknown;
  add(): unknown;
  move(id: string, parent: string | null, before: string | null): unknown;
  nudge(id: string, delta: -1 | 1): unknown;
}

export class GridViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'taskrunner.grid';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private handlers: Partial<GridHandlers> = {},
  ) {}

  private state: GridState = { buttons: [], errors: [], needsConfig: false };
  private current?: vscode.Webview;
  private settings: GridSettings = DEFAULT_SETTINGS;
  private runs?: RunTracker;
  /** The group the webview shows (null: the top); Add puts new buttons there. */
  private group: string | null = null;

  /** The group being shown, if it is still in the file. */
  get location(): GridButton | undefined {
    return this.group === null ? undefined : this.state.buttons.find((b) => b.id === this.group && b.kind === 'group');
  }

  findButton(id: string): GridButton | undefined {
    return this.state.buttons.find((b) => b.id === id);
  }

  allButtons(): readonly GridButton[] {
    return this.state.buttons;
  }

  setSettings(settings: GridSettings): void {
    this.settings = settings;
    this.repost();
  }

  /** Where run state comes from. */
  setRunTracker(runs: RunTracker): void {
    this.runs = runs;
  }

  /** Redraw after run state or workspace folders changed. */
  repost(): void {
    if (this.current) this.postState(this.current);
  }

  setHandlers(handlers: Partial<GridHandlers>): void {
    this.handlers = handlers;
  }

  /** Replace what the grid shows and redraw if the view is showing. */
  setState(state: GridState): void {
    this.state = state;
    this.repost();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    const webview = view.webview;
    this.current = webview;
    // Icon images may come from the workspace folders as well as from media/.
    const setOptions = (): void => {
      webview.options = { enableScripts: true, localResourceRoots: [media, ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)] };
    };
    setOptions();
    const folders = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      setOptions();
      this.repost();
    });
    view.onDidDispose(() => {
      folders.dispose();
      if (this.current === webview) this.current = undefined;
    });
    webview.html = gridHtml({
      cspSource: webview.cspSource,
      nonce: makeNonce(),
      codiconCss: webview.asWebviewUri(vscode.Uri.joinPath(media, 'codicons', 'codicon.css')).toString(),
      gridCss: webview.asWebviewUri(vscode.Uri.joinPath(media, 'grid.css')).toString(),
      script: webview.asWebviewUri(vscode.Uri.joinPath(media, 'webview.js')).toString(),
    });
    webview.onDidReceiveMessage((msg: unknown) => this.onMessage(webview, msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) this.postState(webview);
    });
  }

  /** Handle one inbound message; anything that fails validation is ignored. */
  onMessage(webview: Pick<vscode.Webview, 'postMessage' | 'asWebviewUri'>, msg: unknown): void {
    const parsed = parseWebviewMessage(msg);
    if (parsed?.type === 'ready') {
      this.postState(webview);
    } else if (parsed?.type === 'run') {
      const button = this.state.buttons.find((b) => b.id === parsed.id);
      if (button && button.kind !== 'group') this.handlers.run?.(button, { restart: parsed.restart });
    } else if (parsed?.type === 'openError') {
      this.handlers.openError?.(parsed.index);
    } else if (parsed?.type === 'pickTasks') {
      this.handlers.pickTasks?.();
    } else if (parsed?.type === 'createConfig') {
      this.handlers.createConfig?.();
    } else if (parsed?.type === 'add') {
      this.handlers.add?.();
    } else if (parsed?.type === 'location') {
      this.group = parsed.group;
    } else if (parsed?.type === 'move') {
      this.handlers.move?.(parsed.id, parsed.parent, parsed.before);
    } else if (parsed?.type === 'nudge') {
      this.handlers.nudge?.(parsed.id, parsed.delta);
    }
  }

  private postState(webview: Pick<vscode.Webview, 'postMessage' | 'asWebviewUri'>): void {
    const state: HostToWebview = {
      type: 'state',
      buttons: this.state.buttons.map((b) => this.viewOf(b, webview)),
      errors: [...this.state.errors],
      needsConfig: this.state.needsConfig,
      settings: this.settings,
    };
    void webview.postMessage(state);
  }

  private viewOf(button: GridButton, webview: Pick<vscode.Webview, 'asWebviewUri'>): ButtonView {
    const { view, problem } = iconView(button.icon, button.folder, webview);
    const info = this.runs?.get(button);
    const lines = [button.tooltip, problem, button.state === 'ok' ? describeRun(info) : undefined];
    return toView(button, view, info?.status ?? 'idle', lines.filter(Boolean).join('\n'));
  }
}
