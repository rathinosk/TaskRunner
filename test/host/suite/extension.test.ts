import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseConfig } from '../../../src/core/config';
import { mergeButtons } from '../../../src/core/merge';
import type { HostToWebview } from '../../../src/core/protocol';
import type { GridButton, ShellButton } from '../../../src/host/buttons';
import { GridViewProvider, type GridState } from '../../../src/host/gridView';
import { GridModel } from '../../../src/host/model';
import { runButton, runShellButton } from '../../../src/host/run';
import { RunTracker } from '../../../src/host/runTracker';
import { findTask, listTasks, runTaskById } from '../../../src/host/taskSource';

describe('host/extension', () => {
  it('registers taskrunner.ping', async () => {
    const result = await vscode.commands.executeCommand('taskrunner.ping');
    assert.strictEqual(result, 'pong');
  });

  it('contributes the Task Runner view and the Show Tasks command', () => {
    const pkg = vscode.extensions.getExtension('Rathinosk.vscode-task-runner')?.packageJSON;
    assert.strictEqual(pkg?.contributes?.viewsContainers?.activitybar?.[0]?.title, 'Task Runner');
    assert.strictEqual(pkg?.contributes?.views?.taskrunner?.[0]?.id, GridViewProvider.viewId);
    const commands = (pkg?.contributes?.commands ?? []).map((c: { command: string }) => c.command);
    assert.ok(commands.includes('taskrunner.showTasks'));
    for (const c of ['taskrunner.openConfig', 'taskrunner.createConfig', 'taskrunner.pickTasks']) assert.ok(commands.includes(c), c);
  });

  it('validates taskrunner.json against the shipped schema', () => {
    const pkg = vscode.extensions.getExtension('Rathinosk.vscode-task-runner')?.packageJSON;
    assert.deepStrictEqual(pkg?.contributes?.jsonValidation, [
      { fileMatch: '**/.vscode/taskrunner.json', url: './schemas/taskrunner.schema.json' },
    ]);
  });
});

describe('host/gridView', () => {
  function setup() {
    const posted: unknown[] = [];
    const ran: GridButton[] = [];
    const webview = {
      postMessage: (m: unknown) => (posted.push(m), Promise.resolve(true)),
      asWebviewUri: (u: vscode.Uri) => u,
    };
    const buttons = mergeButtons(
      [{ folder: 'f', buttons: parseConfig('{"buttons":[{"task":"One"},{"task":"Two words"}]}').config!.buttons }],
      [
        { id: 'Workspace|f|One', label: 'One', source: 'Workspace', folder: 'f' },
        { id: 'Workspace|f|Two words', label: 'Two words', source: 'Workspace', folder: 'f', group: 'build' },
      ],
      { trusted: true },
    );
    const actions: string[] = [];
    const provider = new GridViewProvider(vscode.Uri.file('/ext'), {
      run: (b) => ran.push(b),
      openError: (i) => actions.push(`openError ${i}`),
      pickTasks: () => actions.push('pickTasks'),
      createConfig: () => actions.push('createConfig'),
    });
    provider.setState({ buttons, errors: [{ where: 'taskrunner.json:2', message: 'bad' }], needsConfig: true });
    return { posted, ran, actions, webview, provider, buttons };
  }

  it('sends state on ready', () => {
    const { posted, webview, provider, buttons } = setup();
    provider.onMessage(webview, { type: 'ready' });
    const state = posted[0] as HostToWebview;
    assert.strictEqual(state.type, 'state');
    assert.deepStrictEqual(
      state.buttons.map((b) => b.id),
      buttons.map((b) => b.id),
    );
    assert.deepStrictEqual(state.errors, [{ where: 'taskrunner.json:2', message: 'bad' }]);
    assert.strictEqual(state.needsConfig, true);
    assert.deepStrictEqual(state.settings, { iconSize: 48, showLabels: true, columns: 'auto' });
    assert.deepStrictEqual(
      state.buttons.map((b) => [b.icon.kind, b.run]),
      [['codicon', 'idle'], ['codicon', 'idle']],
    );
  });

  it('sends the settings it is given', () => {
    const { posted, webview, provider } = setup();
    provider.setSettings({ iconSize: 64, showLabels: false, columns: 3 });
    provider.onMessage(webview, { type: 'ready' });
    assert.deepStrictEqual((posted[posted.length - 1] as HostToWebview).settings, { iconSize: 64, showLabels: false, columns: 3 });
  });

  it('routes the banner and empty-state actions', () => {
    const { actions, webview, provider } = setup();
    provider.onMessage(webview, { type: 'openError', index: 0 });
    provider.onMessage(webview, { type: 'pickTasks' });
    provider.onMessage(webview, { type: 'createConfig' });
    assert.deepStrictEqual(actions, ['openError 0', 'pickTasks', 'createConfig']);
  });

  it('runs a known button by id, passing along a restart click', () => {
    const { ran, webview, provider, buttons } = setup();
    provider.onMessage(webview, { type: 'run', id: buttons[1]!.id, restart: false });
    assert.deepStrictEqual(
      ran.map((b) => b.taskId),
      ['Workspace|f|Two words'],
    );
  });

  it('ignores unknown ids and invalid messages', () => {
    const { posted, ran, webview, provider } = setup();
    provider.onMessage(webview, { type: 'run', id: 'nope' });
    provider.onMessage(webview, { type: 'run', command: 'echo hi' });
    provider.onMessage(webview, 'ready');
    assert.deepStrictEqual(ran, []);
    assert.deepStrictEqual(posted, []);
  });
});

describe('host/run', () => {
  it('runs a shell button as a task that exits 0', async function () {
    this.timeout(20000);
    const button: ShellButton = { id: 'test-echo', label: 'Test echo', icon: 'terminal', command: 'echo taskrunner-test' };
    const ended = new Promise<number | undefined>((resolve) => {
      const sub = vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.execution.task.definition.id === button.id) {
          sub.dispose();
          resolve(e.exitCode);
        }
      });
    });
    const execution = await runShellButton(button);
    assert.strictEqual(execution.task.name, 'Test echo');
    assert.strictEqual(execution.task.source, 'Task Runner');
    assert.strictEqual(await ended, 0);
  });
});

describe('host/runTracker', () => {
  async function runShell(tracker: RunTracker, id: string, command: string): Promise<GridButton> {
    const shell: ShellButton = { id, label: id, icon: 'terminal', command };
    const [button] = mergeButtons(
      [{ folder: 'f', buttons: parseConfig(`{"buttons":[{"id":"${id}","command":"${command}"}]}`).config!.buttons }],
      [],
      { trusted: true },
    );
    const ended = new Promise<void>((resolve) => {
      const sub = vscode.tasks.onDidEndTask((e) => {
        if (e.execution.task.definition.id === id) (sub.dispose(), setTimeout(resolve, 50));
      });
    });
    await runShellButton(shell);
    await ended;
    return button!;
  }

  it('shows a run that exits 0 as passed and one that exits 1 as failed', async function () {
    this.timeout(30000);
    const changes: number[] = [];
    const tracker = new RunTracker(() => changes.push(Date.now()));
    try {
      const ok = await runShell(tracker, 'track-ok', 'echo ok');
      assert.strictEqual(tracker.get(ok)?.status, 'passed');
      const bad = await runShell(tracker, 'track-bad', 'exit 1');
      assert.strictEqual(tracker.get(bad)?.status, 'failed');
      assert.strictEqual(tracker.get(bad)?.exitCode, 1);
      assert.strictEqual(tracker.isRunning(bad), false);
      assert.ok(changes.length >= 4, 'start and end of both runs were reported');
    } finally {
      tracker.dispose();
    }
  });
});

describe('host/taskSource', () => {
  it('lists tasks.json tasks in file order, with comments and trailing commas', async () => {
    const tasks = (await listTasks()).filter((t) => t.source === 'Workspace');
    assert.deepStrictEqual(
      tasks.map((t) => t.label),
      ['Zed echo', 'Alpha echo', 'Both'],
    );
    assert.strictEqual(tasks[1]?.group, 'build');
    assert.ok(tasks.every((t) => t.folder.length > 0));
  });

  it('resolves an id back to a live task', async () => {
    const info = (await listTasks()).find((t) => t.label === 'Alpha echo');
    assert.ok(info);
    const task = await findTask(info.id);
    assert.strictEqual(task?.name, 'Alpha echo');
    assert.strictEqual(await findTask('Workspace||nope'), undefined);
  });

  it('runs a tasks.json task by id, with dependsOn and variables', async function () {
    this.timeout(30000);
    const info = (await listTasks()).find((t) => t.label === 'Both');
    assert.ok(info);
    const ended: string[] = [];
    const sub = vscode.tasks.onDidEndTaskProcess((e) => ended.push(`${e.execution.task.name}:${e.exitCode}`));
    assert.strictEqual(await runTaskById(info.id), true);
    const deadline = Date.now() + 20000;
    while (ended.length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    sub.dispose();
    assert.deepStrictEqual([...ended].sort(), ['Alpha echo:0', 'Zed echo:0']);
  });
});

describe('host/model', () => {
  const folder = () => vscode.workspace.workspaceFolders![0]!;
  const configUri = () => vscode.Uri.joinPath(folder().uri, '.vscode', 'taskrunner.json');
  const write = (text: string) => vscode.workspace.fs.writeFile(configUri(), Buffer.from(text, 'utf8'));
  const remove = () => Promise.resolve(vscode.workspace.fs.delete(configUri())).catch(() => undefined);

  function setup() {
    const states: GridState[] = [];
    const model = new GridModel({ setState: (s) => states.push(s) });
    return { model, states };
  }

  beforeEach(remove);
  afterEach(remove);

  it('offers the empty state when there is no taskrunner.json', async () => {
    const { model } = setup();
    const state = await model.refresh();
    model.dispose();
    assert.deepStrictEqual([state?.buttons, state?.errors, state?.needsConfig], [[], [], true]);
  });

  it("shows the author's list in the author's order, tasks and shell commands", async () => {
    await write('{ // mine\n "buttons": [ { "command": "echo hi", "label": "Hi" }, { "task": "Alpha echo" }, { "task": "nope" }, ] }');
    const { model } = setup();
    const state = await model.refresh();
    model.dispose();
    assert.deepStrictEqual(
      state?.buttons.map((b) => [b.label, b.state]),
      [
        ['Hi', 'ok'],
        ['Alpha echo', 'ok'],
        ['nope', 'missing'],
      ],
    );
    assert.strictEqual(state?.needsConfig, false);
  });

  it('runs VS Code command buttons with their args as written, and marks an unknown command missing', async () => {
    const calls: unknown[][] = [];
    const sub = vscode.commands.registerCommand('taskrunner.test.record', (...args: unknown[]) => calls.push(args));
    try {
      await write('{ "buttons": [ { "vscode": "taskrunner.test.record" }, { "vscode": "taskrunner.test.record", "args": { "a": [1, null], "s": "${workspaceFolder}" } }, { "vscode": "taskrunner.test.nope" } ] }');
      const { model } = setup();
      const state = await model.refresh();
      model.dispose();
      assert.deepStrictEqual(
        state?.buttons.map((b) => [b.kind, b.state]),
        [
          ['command', 'ok'],
          ['command', 'ok'],
          ['command', 'missing'],
        ],
      );
      for (const b of state!.buttons.slice(0, 2)) await runButton(b);
      assert.deepStrictEqual(calls, [[], [{ a: [1, null], s: '${workspaceFolder}' }]]);
    } finally {
      sub.dispose();
    }
  });

  it('keeps the last good grid on a broken edit and reports the line, then recovers', async () => {
    const { model } = setup();
    await write('{"buttons":[{"task":"Alpha echo"}]}');
    await model.refresh();
    await write('{\n"buttons": [\n{ "task": }\n]\n}');
    const broken = await model.refresh();
    assert.deepStrictEqual(
      broken?.buttons.map((b) => b.label),
      ['Alpha echo'],
    );
    assert.deepStrictEqual(broken?.errors.map((e) => e.where), ['taskrunner.json:3']);
    await write('{"buttons":[{"task":"Zed echo"}]}');
    const fixed = await model.refresh();
    model.dispose();
    assert.deepStrictEqual(fixed?.buttons.map((b) => b.label), ['Zed echo']);
    assert.deepStrictEqual(fixed?.errors, []);
  });

  it('shows no buttons, with the error, when the first read is already broken', async () => {
    await write('{"buttons": 3}');
    const { model } = setup();
    const state = await model.refresh();
    model.dispose();
    assert.deepStrictEqual([state?.buttons, state?.needsConfig, state?.errors.length], [[], false, 1]);
  });

  it('drops the grid when the file is deleted', async () => {
    const { model } = setup();
    await write('{"buttons":[{"task":"Alpha echo"}]}');
    await model.refresh();
    await remove();
    const state = await model.refresh();
    model.dispose();
    assert.deepStrictEqual([state?.buttons, state?.needsConfig], [[], true]);
  });
});
