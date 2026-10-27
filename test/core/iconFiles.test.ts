import * as assert from 'assert';
import { parseIcon } from '../../src/core/icons';
import { iconPathFor, isIconFile, safeIconName, uniqueIconName } from '../../src/core/iconFiles';

describe('core/iconFiles', () => {
  it('writes a path the icon rules accept', () => {
    assert.deepStrictEqual(parseIcon(iconPathFor('build.svg')), { kind: 'file', path: '.vscode/taskrunner-icons/build.svg' });
    assert.strictEqual(parseIcon(iconPathFor(safeIconName('we?ird:name#1.PNG')))?.kind, 'file');
  });

  it('cleans a name: no path, no rejected characters, lower-case extension', () => {
    assert.strictEqual(safeIconName('C:\\icons\\Build Icon.SVG'), 'Build Icon.svg');
    assert.strictEqual(safeIconName('a<b>|c.png'), 'a-b-c.png');
    assert.strictEqual(safeIconName('...png'), 'icon.png');
  });

  it('adds a number on a clash, ignoring case, and keeps the name otherwise', () => {
    assert.strictEqual(uniqueIconName('a.svg', new Set()), 'a.svg');
    assert.strictEqual(uniqueIconName('a.svg', new Set(['A.SVG'])), 'a-2.svg');
    assert.strictEqual(uniqueIconName('a.svg', new Set(['a.svg', 'a-2.svg'])), 'a-3.svg');
  });

  it('knows image files', () => {
    assert.ok(isIconFile('x.SVG') && isIconFile('y.png'));
    assert.ok(!isIconFile('z.jpg') && !isIconFile('svg'));
  });
});
