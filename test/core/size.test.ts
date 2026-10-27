import * as assert from 'assert';
import { clampIconSize } from '../../src/core/size';

describe('core/size', () => {
  it('clamps to 32-128', () => {
    assert.strictEqual(clampIconSize(10), 32);
    assert.strictEqual(clampIconSize(48), 48);
    assert.strictEqual(clampIconSize(200), 128);
    assert.strictEqual(clampIconSize(NaN), 32);
  });
});
