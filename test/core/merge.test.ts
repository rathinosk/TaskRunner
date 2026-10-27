import * as assert from 'assert';
import { parseConfig } from '../../src/core/config';
import { mergeButtons } from '../../src/core/merge';
import { taskId, type TaskInfo } from '../../src/core/tasks';

function task(label: string, source = 'Workspace', folder = 'f', group?: string): TaskInfo {
  return { id: taskId(source, folder, label), label, source, folder, ...(group ? { group } : {}) };
}

const buttons = (json: string) => parseConfig(json).config!.buttons;
const trusted = { trusted: true };

describe('core/merge', () => {
  const tasks = [task('build', 'Workspace', 'f', 'build'), task('test'), task('lint', 'npm'), task('test', 'npm')];

  it('keeps the order of the config, not of the task list', () => {
    const merged = mergeButtons([{ folder: 'f', buttons: buttons('{"buttons":[{"task":"test"},{"task":"build"}]}') }], tasks, trusted);
    assert.deepStrictEqual(
      merged.map((b) => b.label),
      ['test', 'build'],
    );
    assert.deepStrictEqual(
      merged.map((b) => b.taskId),
      ['Workspace|f|test', 'Workspace|f|build'],
    );
  });

  it('uses label, icon and tooltip overrides, else the task group icon', () => {
    const [a, b] = mergeButtons(
      [{ folder: 'f', buttons: buttons('{"buttons":[{"task":"build"},{"task":"test","label":"T","icon":"rocket","tooltip":"hi"}]}') }],
      tasks,
      trusted,
    );
    assert.deepStrictEqual([a?.label, a?.icon, a?.state], ['build', 'tools', 'ok']);
    assert.match(a!.tooltip, /Run task: build \(Workspace · f\)/);
    assert.deepStrictEqual([b?.label, b?.icon, b?.tooltip], ['T', 'rocket', 'hi']);
  });

  it('narrows duplicate labels by source', () => {
    const [a, b] = mergeButtons([{ folder: 'f', buttons: buttons('{"buttons":[{"task":"test"},{"task":"test","source":"npm"}]}') }], tasks, trusted);
    assert.strictEqual(a?.taskId, 'Workspace|f|test');
    assert.strictEqual(b?.taskId, 'npm|f|test');
  });

  it('keeps a button whose task is missing, marked missing with the reason', () => {
    const [m] = mergeButtons([{ folder: 'f', buttons: buttons('{"buttons":[{"task":"gone","label":"Gone"}]}') }], tasks, trusted);
    assert.deepStrictEqual([m?.state, m?.label, m?.icon, m?.taskId], ['missing', 'Gone', 'warning', undefined]);
    assert.match(m!.tooltip, /"gone".*not found/);
  });

  it('treats a source or folder that matches nothing as missing', () => {
    const merged = mergeButtons(
      [{ folder: 'f', buttons: buttons('{"buttons":[{"task":"build","source":"npm"},{"task":"build","folder":"other"}]}') }],
      tasks,
      trusted,
    );
    assert.deepStrictEqual(
      merged.map((b) => b.state),
      ['missing', 'missing'],
    );
  });

  it('makes shell buttons with defaults and carries cwd, env and shell', () => {
    const [s] = mergeButtons(
      [{ folder: 'f', buttons: buttons('{"buttons":[{"command":"make all","cwd":"sub","env":{"A":"1"},"shell":"bash","confirm":true}]}') }],
      tasks,
      trusted,
    );
    assert.deepStrictEqual([s?.kind, s?.label, s?.icon, s?.state, s?.confirm, s?.folder], ['shell', 'make all', 'terminal', 'ok', true, 'f']);
    assert.deepStrictEqual(s?.shell, { command: 'make all', cwd: 'sub', env: { A: '1' }, shell: 'bash' });
    assert.match(s!.tooltip, /Run: make all\nIn: sub/);
  });

  it('merges several folders in the order given, preferring a task in the config\'s own folder', () => {
    const multi = [task('build', 'Workspace', 'a'), task('build', 'Workspace', 'b')];
    const merged = mergeButtons(
      [
        { folder: 'a', buttons: buttons('{"buttons":[{"task":"build","id":"same"}]}') },
        { folder: 'b', buttons: buttons('{"buttons":[{"task":"build","id":"same"},{"task":"build","folder":"a","id":"other"}]}') },
      ],
      multi,
      trusted,
    );
    assert.deepStrictEqual(
      merged.map((b) => [b.id, b.folder, b.taskId]),
      [
        ['same', 'a', 'Workspace|a|build'],
        ['same-2', 'b', 'Workspace|b|build'],
        ['other', 'b', 'Workspace|a|build'],
      ],
    );
  });

  it('marks everything untrusted in an untrusted workspace', () => {
    const merged = mergeButtons(
      [{ folder: 'f', buttons: buttons('{"buttons":[{"task":"build"},{"command":"x"}]}') }],
      tasks,
      { trusted: false },
    );
    assert.deepStrictEqual(
      merged.map((b) => b.state),
      ['untrusted', 'untrusted'],
    );
  });

  it('gives no buttons for no configs', () => {
    assert.deepStrictEqual(mergeButtons([], tasks, trusted), []);
  });
});
