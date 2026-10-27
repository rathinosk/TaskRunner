import * as assert from 'assert';
import { gridHtml, makeNonce } from '../../src/webview/html';

describe('webview/html', () => {
  const html = gridHtml({
    cspSource: 'https://webview.test',
    nonce: 'abc123',
    codiconCss: 'https://webview.test/codicon.css',
    gridCss: 'https://webview.test/grid.css',
    script: 'https://webview.test/webview.js',
  });

  it('has a strict CSP with the nonce', () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
    assert.ok(csp, 'CSP meta tag');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'nonce-abc123'/);
    assert.match(csp, /style-src https:\/\/webview\.test(;|$)/);
    assert.doesNotMatch(csp, /unsafe-|\*/);
  });

  it('loads only the given resources, and its one script carries the nonce', () => {
    const urls = [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(urls.sort(), [
      'https://webview.test/codicon.css',
      'https://webview.test/grid.css',
      'https://webview.test/webview.js',
    ]);
    assert.deepStrictEqual(html.match(/<script[^>]*>/g), ['<script nonce="abc123" src="https://webview.test/webview.js">']);
    assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=/);
  });

  it('makes a fresh 32-character nonce', () => {
    const a = makeNonce();
    assert.match(a, /^[A-Za-z0-9]{32}$/);
    assert.notStrictEqual(a, makeNonce());
  });
});
