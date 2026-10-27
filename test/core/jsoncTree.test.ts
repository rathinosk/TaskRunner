import * as assert from 'assert';
import { parseJsoncTree, positionAt } from '../../src/core/jsonc';

describe('core/jsonc parseJsoncTree', () => {
  it('parses values with offsets, comments and trailing commas', () => {
    const text = '{ // c\n  "a": [1, true, null,], /* x */ "b": "s\\n",\n}';
    const { root, error } = parseJsoncTree(text);
    assert.strictEqual(error, undefined);
    assert.ok(root?.kind === 'object');
    assert.deepStrictEqual(
      root.props.map((p) => p.key),
      ['a', 'b'],
    );
    const b = root.props[1]!;
    assert.strictEqual(text.slice(b.keyOffset, b.keyOffset + 3), '"b"');
    assert.ok(b.value.kind === 'string');
    assert.strictEqual(b.value.value, 's\n');
    const a = root.props[0]!.value;
    assert.ok(a.kind === 'array');
    assert.deepStrictEqual(
      a.items.map((i) => i.kind),
      ['number', 'boolean', 'null'],
    );
  });

  it('accepts a BOM', () => {
    assert.ok(parseJsoncTree('﻿{}').root);
  });

  it('reports the first syntax error with its offset', () => {
    const cases: [string, string][] = [
      ['{"a": }', 'Unexpected character'],
      ['{"a": 1 "b": 2}', "Expected ',' or '}'"],
      ['{a: 1}', 'Expected a property name in double quotes'],
      ['{"a" 1}', "Expected ':' after the property name"],
      ['[1 2]', "Expected ',' or ']'"],
      ['{"a": "x', 'Unterminated string'],
      ['{"a": 1} x', 'Unexpected content after the end of the value'],
      ['/* open', 'Unterminated comment'],
      ['', 'Unexpected end of file'],
      ['{"a": 01}', 'Unexpected character'],
    ];
    for (const [text, message] of cases) {
      const { root, error } = parseJsoncTree(text);
      assert.strictEqual(root, undefined, text);
      assert.strictEqual(error?.message, message, text);
    }
    assert.strictEqual(parseJsoncTree('{"a": }').error?.offset, 6);
  });
});

describe('core/jsonc positionAt', () => {
  it('gives 0-based line and column', () => {
    const text = 'ab\ncd\r\nef';
    assert.deepStrictEqual(positionAt(text, 0), { line: 0, column: 0 });
    assert.deepStrictEqual(positionAt(text, 4), { line: 1, column: 1 });
    assert.deepStrictEqual(positionAt(text, 7), { line: 2, column: 0 });
    assert.deepStrictEqual(positionAt(text, 99), { line: 2, column: 2 });
  });
});
