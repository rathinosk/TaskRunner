import * as assert from 'assert';
import { codiconNames, parseIcon, resolveIcon } from '../../src/core/icons';

describe('core/icons', () => {
  describe('parseIcon', () => {
    it('reads a Codicon name', () => {
      assert.deepStrictEqual(parseIcon('tools'), { kind: 'codicon', name: 'tools' });
      assert.deepStrictEqual(parseIcon('debug-alt-small'), { kind: 'codicon', name: 'debug-alt-small' });
    });

    it('reads a workspace-relative svg or png path', () => {
      assert.deepStrictEqual(parseIcon('./icons/build.svg'), { kind: 'file', path: 'icons/build.svg' });
      assert.deepStrictEqual(parseIcon('./a b/C.PNG'), { kind: 'file', path: 'a b/C.PNG' });
    });

    it('rejects paths that leave the folder, other file types and odd paths', () => {
      for (const bad of ['../x.svg', './../x.svg', './a/../x.svg', './a//x.svg', 'icons/x.svg', '/etc/x.png', 'C:/x.png', './x.gif', './x.svg?y', '.\\x.svg']) {
        assert.notStrictEqual(parseIcon(bad)?.kind, 'file', bad);
      }
    });

    it('reads emoji, including sequences, and rejects plain words and markup', () => {
      assert.deepStrictEqual(parseIcon('🚀'), { kind: 'text', text: '🚀' });
      assert.deepStrictEqual(parseIcon('👨‍👩‍👧'), { kind: 'text', text: '👨‍👩‍👧' });
      assert.deepStrictEqual(parseIcon('▶'), { kind: 'text', text: '▶' });
      assert.strictEqual(parseIcon('Not An Icon'), undefined);
      assert.strictEqual(parseIcon('<b>x</b>'), undefined);
      assert.strictEqual(parseIcon('🚀 🚀'), undefined);
      assert.strictEqual(parseIcon('🚀'.repeat(13)), undefined);
      assert.strictEqual(parseIcon(''), undefined);
    });
  });

  describe('codiconNames', () => {
    it('lists the names in a codicon.css, aliases included', () => {
      const css = '.codicon-add:before { content: "\\ea60" }\n.codicon-plus:before { content: "\\ea60" }\n.codicon-debug-alt::before{}\n.codicon-modifier-spin { animation: x }';
      assert.deepStrictEqual([...codiconNames(css)].sort(), ['add', 'debug-alt', 'plus']);
    });
  });

  describe('resolveIcon', () => {
    const known = new Set(['tools']);

    it('keeps a known Codicon, an image path and an emoji', () => {
      assert.deepStrictEqual(resolveIcon('tools', known), { spec: { kind: 'codicon', name: 'tools' } });
      assert.strictEqual(resolveIcon('./a.svg', known).spec.kind, 'file');
      assert.strictEqual(resolveIcon('🚀', known).spec.kind, 'text');
    });

    it('shows the placeholder and says what is accepted for an unknown name or a non-icon', () => {
      for (const bad of ['nope', 'Not An Icon']) {
        const r = resolveIcon(bad, known);
        assert.deepStrictEqual(r.spec, { kind: 'codicon', name: 'question' });
        assert.match(r.problem ?? '', /Codicon name.*\.svg.*emoji/);
        assert.ok(r.problem?.includes(`"${bad}"`));
      }
    });

    it('trusts any Codicon-shaped name while the list is unavailable', () => {
      assert.deepStrictEqual(resolveIcon('nope', undefined), { spec: { kind: 'codicon', name: 'nope' } });
    });
  });
});
