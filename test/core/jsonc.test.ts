import * as assert from 'assert';
import { parseJsonc } from '../../src/core/jsonc';

describe('core/jsonc', () => {
  it('reads comments and trailing commas', () => {
    const text = '\ufeff{\n // line\n "a": [1, 2,], /* block */ "b": {"c": 3,},\n}';
    assert.deepStrictEqual(parseJsonc(text), { a: [1, 2], b: { c: 3 } });
  });

  it('leaves comment-like text and commas inside strings alone', () => {
    const text = '{"url": "http://x/*y*/", "s": "a,]", "q": "say \\"//hi\\""}';
    assert.deepStrictEqual(parseJsonc(text), { url: 'http://x/*y*/', s: 'a,]', q: 'say "//hi"' });
  });

  it('returns undefined for broken text', () => {
    assert.strictEqual(parseJsonc('{ "a": '), undefined);
    assert.strictEqual(parseJsonc(''), undefined);
  });
});
