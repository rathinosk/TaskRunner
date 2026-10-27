import * as assert from 'assert';
import { isButtonId } from '../../src/core/protocol';
import { buttonIdFor, declaredLabels, orderTasks, parseTaskId, taskId, type TaskInfo } from '../../src/core/tasks';

const t = (source: string, folder: string, label: string): TaskInfo => ({
  id: taskId(source, folder, label),
  label,
  source,
  folder,
});

describe('core/tasks', () => {
  it('declaredLabels reads a realistic tasks.json', () => {
    const text = `{
      // build things
      "version": "2.0.0",
      "inputs": [{ "id": "x", "type": "promptString", "description": "x" },],
      "tasks": [
        { "label": "build", "type": "shell", "command": "dotnet build \${workspaceFolder}/a.sln", },
        { "label": "all", "dependsOn": ["build"] }, /* group */
        { "type": "npm", "script": "test" },
      ],
    }`;
    assert.deepStrictEqual(declaredLabels(text), ['build', 'all']);
  });

  it('declaredLabels is empty for unusable text', () => {
    assert.deepStrictEqual(declaredLabels('{ nope'), []);
    assert.deepStrictEqual(declaredLabels('[]'), []);
    assert.deepStrictEqual(declaredLabels('{"tasks": 3}'), []);
  });

  it('task id round trips, including a name with a pipe', () => {
    const id = taskId('npm', 'web', 'a|b c');
    assert.deepStrictEqual(parseTaskId(id), { source: 'npm', folder: 'web', name: 'a|b c' });
    assert.strictEqual(parseTaskId('nope'), undefined);
  });

  it('identical labels in two folders stay distinct', () => {
    const a = t('Workspace', 'one', 'build');
    const b = t('Workspace', 'two', 'build');
    assert.notStrictEqual(a.id, b.id);
    assert.notStrictEqual(buttonIdFor(a), buttonIdFor(b));
  });

  it('button ids satisfy the webview id syntax', () => {
    assert.ok(isButtonId(buttonIdFor(t('Workspace', 'my folder', 'Build all: ${x}'))));
  });

  it('orders workspace tasks by file order, then providers by source', () => {
    const tasks = [t('npm', 'f', 'build'), t('Workspace', 'f', 'b'), t('Workspace', 'f', 'z'), t('Workspace', 'f', 'a')];
    const ordered = orderTasks(tasks, new Map([['f', ['a', 'b']]]));
    assert.deepStrictEqual(
      ordered.map((x) => x.label),
      ['a', 'b', 'z', 'build'],
    );
  });
});
