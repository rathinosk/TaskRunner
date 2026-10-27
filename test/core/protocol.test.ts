import * as assert from 'assert';
import { parseHostMessage, parseWebviewMessage } from '../../src/core/protocol';

describe('core/protocol', () => {
  describe('parseWebviewMessage', () => {
    it('accepts ready and run by id', () => {
      assert.deepStrictEqual(parseWebviewMessage({ type: 'ready' }), { type: 'ready' });
      assert.deepStrictEqual(parseWebviewMessage({ type: 'run', id: 'build' }), { type: 'run', id: 'build', restart: false });
      assert.deepStrictEqual(parseWebviewMessage({ type: 'run', id: 'build', restart: true }), { type: 'run', id: 'build', restart: true });
    });

    it('accepts the empty-state and banner actions', () => {
      assert.deepStrictEqual(parseWebviewMessage({ type: 'pickTasks' }), { type: 'pickTasks' });
      assert.deepStrictEqual(parseWebviewMessage({ type: 'createConfig' }), { type: 'createConfig' });
      assert.deepStrictEqual(parseWebviewMessage({ type: 'openError', index: 2 }), { type: 'openError', index: 2 });
    });

    it('drops extra fields', () => {
      assert.deepStrictEqual(parseWebviewMessage({ type: 'run', id: 'a', command: 'rm -rf /' }), { type: 'run', id: 'a', restart: false });
    });

    it('rejects anything else', () => {
      for (const msg of [
        undefined,
        null,
        'run',
        [],
        {},
        { type: 'run' },
        { type: 'run', id: 3 },
        { type: 'run', id: '' },
        { type: 'run', id: 'echo hi' },
        { type: 'run', id: 'x'.repeat(65) },
        { type: 'exec', id: 'a' },
        { type: 'openError' },
        { type: 'openError', index: -1 },
        { type: 'openError', index: 1.5 },
        { type: 'openError', index: '1' },
      ]) {
        assert.strictEqual(parseWebviewMessage(msg), undefined, JSON.stringify(msg));
      }
    });
  });

  describe('parseHostMessage', () => {
    const button = { id: 'a', label: 'A', icon: { kind: 'codicon', name: 'tools' }, tooltip: 'Run: a', state: 'ok', run: 'idle' };
    const settings = { iconSize: 48, showLabels: true, columns: 'auto' };

    it('accepts state', () => {
      assert.deepStrictEqual(parseHostMessage({ type: 'state', buttons: [button] }), {
        type: 'state',
        buttons: [button],
        errors: [],
        needsConfig: false,
        settings,
      });
      assert.deepStrictEqual(parseHostMessage({ type: 'state', buttons: [], errors: [], needsConfig: true }), {
        type: 'state',
        buttons: [],
        errors: [],
        needsConfig: true,
        settings,
      });
    });

    it('keeps well-formed errors and drops the rest', () => {
      const msg = parseHostMessage({ type: 'state', buttons: [], errors: [{ where: 'taskrunner.json:3', message: 'bad' }, { where: 1 }, 'x'] });
      assert.deepStrictEqual(msg?.errors, [{ where: 'taskrunner.json:3', message: 'bad' }]);
    });

    it('keeps a known button state and falls back to ok', () => {
      const states = parseHostMessage({
        type: 'state',
        buttons: [{ ...button, state: 'missing' }, { ...button, state: 'untrusted' }, { ...button, state: 'weird' }, { ...button, state: undefined }],
      })?.buttons.map((b) => b.state);
      assert.deepStrictEqual(states, ['missing', 'untrusted', 'ok', 'ok']);
    });

    it('replaces an invalid icon with a placeholder, and keeps the three kinds', () => {
      const icons = [{ kind: 'codicon', name: 'x" onclick="y' }, 'tools', { kind: 'image', src: 'https://w/a.svg' }, { kind: 'text', text: '🚀' }, { kind: 'text', text: '' }];
      const msg = parseHostMessage({ type: 'state', buttons: icons.map((icon) => ({ ...button, icon })) });
      assert.deepStrictEqual(
        msg?.buttons.map((b) => b.icon),
        [
          { kind: 'codicon', name: 'question' },
          { kind: 'codicon', name: 'question' },
          { kind: 'image', src: 'https://w/a.svg' },
          { kind: 'text', text: '🚀' },
          { kind: 'codicon', name: 'question' },
        ],
      );
    });

    it('keeps a known run status and falls back to idle', () => {
      const runs = ['running', 'passed', 'failed', 'weird', undefined].map((run) => ({ ...button, run }));
      assert.deepStrictEqual(
        parseHostMessage({ type: 'state', buttons: runs })?.buttons.map((b) => b.run),
        ['running', 'passed', 'failed', 'idle', 'idle'],
      );
    });

    it('repairs unusable settings', () => {
      const msg = parseHostMessage({ type: 'state', buttons: [], settings: { iconSize: 500, showLabels: 'yes', columns: 99 } });
      assert.deepStrictEqual(msg?.settings, { iconSize: 128, showLabels: true, columns: 'auto' });
    });

    it('rejects malformed state', () => {
      assert.strictEqual(parseHostMessage({ type: 'state' }), undefined);
      assert.strictEqual(parseHostMessage({ type: 'state', buttons: [{ ...button, id: 'a b' }] }), undefined);
      assert.strictEqual(parseHostMessage({ type: 'state', buttons: [{ ...button, label: 1 }] }), undefined);
      assert.strictEqual(parseHostMessage({ type: 'other', buttons: [] }), undefined);
    });
  });
});
