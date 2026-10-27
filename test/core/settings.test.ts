import * as assert from 'assert';
import { normalizeSettings } from '../../src/core/settings';

describe('core/settings', () => {
  it('defaults to 48 px, labels on, auto columns', () => {
    assert.deepStrictEqual(normalizeSettings({}), { iconSize: 48, showLabels: true, columns: 'auto' });
  });

  it('keeps the icon size within 32-128 in steps of 8', () => {
    const sizes = [10, 32, 35, 44, 48, 60, 64, 200, NaN, '48', undefined].map((iconSize) => normalizeSettings({ iconSize }).iconSize);
    assert.deepStrictEqual(sizes, [32, 32, 32, 48, 48, 64, 64, 128, 48, 48, 48]);
  });

  it('takes a column count from 1 to 12, as a number or a numeric string, else auto', () => {
    const columns = [1, 12, 13, 0, 2.5, '3', ' 4 ', 'auto', 'many', null].map((c) => normalizeSettings({ columns: c }).columns);
    assert.deepStrictEqual(columns, [1, 12, 'auto', 'auto', 'auto', 3, 4, 'auto', 'auto', 'auto']);
  });

  it('takes showLabels only as a boolean', () => {
    assert.strictEqual(normalizeSettings({ showLabels: false }).showLabels, false);
    assert.strictEqual(normalizeSettings({ showLabels: 'no' }).showLabels, true);
  });
});
