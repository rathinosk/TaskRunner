import * as assert from 'assert';
import { nextIndex } from '../../src/webview/grid';

describe('webview/grid', () => {
  // 7 buttons in 3 columns:  0 1 2 / 3 4 5 / 6
  it('moves left and right, stopping at the ends', () => {
    assert.strictEqual(nextIndex(0, 'ArrowRight', 7, 3), 1);
    assert.strictEqual(nextIndex(2, 'ArrowRight', 7, 3), 3);
    assert.strictEqual(nextIndex(6, 'ArrowRight', 7, 3), 6);
    assert.strictEqual(nextIndex(0, 'ArrowLeft', 7, 3), 0);
    assert.strictEqual(nextIndex(3, 'ArrowLeft', 7, 3), 2);
  });

  it('moves up and down by a row, staying put past the edge', () => {
    assert.strictEqual(nextIndex(1, 'ArrowDown', 7, 3), 4);
    assert.strictEqual(nextIndex(4, 'ArrowDown', 7, 3), 4);
    assert.strictEqual(nextIndex(3, 'ArrowDown', 7, 3), 6);
    assert.strictEqual(nextIndex(4, 'ArrowUp', 7, 3), 1);
    assert.strictEqual(nextIndex(1, 'ArrowUp', 7, 3), 1);
  });

  it('jumps with Home and End', () => {
    assert.strictEqual(nextIndex(4, 'Home', 7, 3), 0);
    assert.strictEqual(nextIndex(0, 'End', 7, 3), 6);
  });

  it('treats a single column as a list', () => {
    assert.strictEqual(nextIndex(0, 'ArrowDown', 3, 1), 1);
    assert.strictEqual(nextIndex(0, 'ArrowDown', 3, 0), 1);
  });

  it('ignores other keys and an empty grid', () => {
    assert.strictEqual(nextIndex(0, 'Enter', 7, 3), undefined);
    assert.strictEqual(nextIndex(0, 'a', 7, 3), undefined);
    assert.strictEqual(nextIndex(0, 'ArrowRight', 0, 3), undefined);
  });
});
