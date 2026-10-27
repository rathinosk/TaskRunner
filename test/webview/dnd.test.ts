import * as assert from 'assert';
import { dropPosition, planAppend, planMove } from '../../src/webview/dnd';

describe('webview/dnd', () => {
  it('splits a plain button in halves and a group in quarters with "into" between', () => {
    assert.strictEqual(dropPosition(10, 0, 100, false), 'before');
    assert.strictEqual(dropPosition(60, 0, 100, false), 'after');
    assert.strictEqual(dropPosition(10, 0, 100, true), 'before');
    assert.strictEqual(dropPosition(50, 0, 100, true), 'into');
    assert.strictEqual(dropPosition(90, 0, 100, true), 'after');
    assert.strictEqual(dropPosition(5, 0, 0, false), 'after');
  });

  const all = ['a', 'b', 'c', 'd'];

  it('puts a button before or after another', () => {
    assert.deepStrictEqual(planMove(all, 'd', 'b', 'before', null), { parent: null, before: 'b' });
    assert.deepStrictEqual(planMove(all, 'a', 'c', 'after', null), { parent: null, before: 'd' });
    assert.deepStrictEqual(planMove(all, 'a', 'd', 'after', 'g'), { parent: 'g', before: null });
  });

  it('asks for nothing when the button would stay where it is', () => {
    assert.strictEqual(planMove(all, 'b', 'c', 'before', null), undefined);
    assert.strictEqual(planMove(all, 'b', 'a', 'after', null), undefined);
    assert.strictEqual(planMove(all, 'b', 'b', 'before', null), undefined);
    assert.strictEqual(planMove(all, 'd', 'x', 'before', null), undefined);
  });

  it('moves into a group, last', () => {
    assert.deepStrictEqual(planMove(all, 'a', 'c', 'into', null), { parent: 'c', before: null });
  });

  it('appends in the empty space, unless already last', () => {
    assert.deepStrictEqual(planAppend(all, 'a', 'g'), { parent: 'g', before: null });
    assert.strictEqual(planAppend(all, 'd', 'g'), undefined);
    assert.deepStrictEqual(planAppend(['a'], 'z', null), { parent: null, before: null });
  });
});
