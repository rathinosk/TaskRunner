// Small JSONC reader (ADR-0002: no jsonc-parser). Accepts // and /* */ comments,
// trailing commas and a leading BOM, the way VS Code reads tasks.json.

/** Replace comments with spaces (keeping offsets) and drop trailing commas. */
export function stripJsonc(text: string): string {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '"') {
      const start = i++;
      while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
      i = Math.min(i + 1, src.length);
      out.push(src.slice(start, i));
    } else if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
    } else if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      out.push(' ');
    } else {
      out.push(ch);
      i++;
    }
  }
  return removeTrailingCommas(out.join(''));
}

function removeTrailingCommas(src: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '"') {
      const start = i++;
      while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
      i = Math.min(i + 1, src.length);
      out.push(src.slice(start, i));
    } else if (ch === ',') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j]!)) j++;
      if (src[j] !== ']' && src[j] !== '}') out.push(ch);
      i++;
    } else {
      out.push(ch);
      i++;
    }
  }
  return out.join('');
}

/** Parse JSONC text; undefined when it is not valid even after tolerating comments and trailing commas. */
export function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(stripJsonc(text));
  } catch {
    return undefined;
  }
}

export type JsonNode =
  | { kind: 'object'; offset: number; end: number; props: JsonProp[] }
  | { kind: 'array'; offset: number; end: number; items: JsonNode[] }
  | { kind: 'string'; offset: number; end: number; value: string }
  | { kind: 'number'; offset: number; end: number; value: number }
  | { kind: 'boolean'; offset: number; end: number; value: boolean }
  | { kind: 'null'; offset: number; end: number };

export interface JsonProp {
  key: string;
  keyOffset: number;
  value: JsonNode;
}

export interface JsoncTree {
  root?: JsonNode;
  /** The first syntax error, with the offset it was found at. */
  error?: { message: string; offset: number };
}

class SyntaxProblem extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

/**
 * Parse JSONC into a tree that keeps source offsets, so a validator can point at a line.
 * Same leniency as parseJsonc (comments, trailing commas, BOM); stops at the first syntax error.
 */
export function parseJsoncTree(text: string): JsoncTree {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const skip = (): void => {
    for (;;) {
      const ch = text[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') i++;
      else if (ch === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
      } else if (ch === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end < 0) throw new SyntaxProblem('Unterminated comment', i);
        i = end + 2;
      } else return;
    }
  };

  const string = (): { value: string; offset: number; end: number } => {
    const offset = i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\n' || text[i] === '\r') throw new SyntaxProblem('Unterminated string', offset);
      i += text[i] === '\\' ? 2 : 1;
    }
    if (i >= text.length) throw new SyntaxProblem('Unterminated string', offset);
    i++;
    try {
      return { value: JSON.parse(text.slice(offset, i)) as string, offset, end: i };
    } catch {
      throw new SyntaxProblem('Invalid escape sequence in string', offset);
    }
  };

  const value = (): JsonNode => {
    skip();
    const offset = i;
    const ch = text[i];
    if (ch === '{') {
      i++;
      const props: JsonProp[] = [];
      for (;;) {
        skip();
        if (text[i] === '}') break;
        if (text[i] !== '"') throw new SyntaxProblem('Expected a property name in double quotes', i);
        const key = string();
        skip();
        if (text[i] !== ':') throw new SyntaxProblem("Expected ':' after the property name", i);
        i++;
        props.push({ key: key.value, keyOffset: key.offset, value: value() });
        skip();
        if (text[i] === ',') i++;
        else if (text[i] !== '}') throw new SyntaxProblem("Expected ',' or '}'", i);
      }
      return { kind: 'object', offset, end: ++i, props };
    }
    if (ch === '[') {
      i++;
      const items: JsonNode[] = [];
      for (;;) {
        skip();
        if (text[i] === ']') break;
        items.push(value());
        skip();
        if (text[i] === ',') i++;
        else if (text[i] !== ']') throw new SyntaxProblem("Expected ',' or ']'", i);
      }
      return { kind: 'array', offset, end: ++i, items };
    }
    if (ch === '"') {
      const s = string();
      return { kind: 'string', offset, end: s.end, value: s.value };
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![\w.])/.exec(text.slice(i, i + 64));
    if (!literal) throw new SyntaxProblem(i >= text.length ? 'Unexpected end of file' : 'Unexpected character', i);
    i += literal[0].length;
    const token = literal[0];
    if (token === 'true' || token === 'false') return { kind: 'boolean', offset, end: i, value: token === 'true' };
    if (token === 'null') return { kind: 'null', offset, end: i };
    return { kind: 'number', offset, end: i, value: Number(token) };
  };

  try {
    const root = value();
    skip();
    if (i < text.length) throw new SyntaxProblem('Unexpected content after the end of the value', i);
    return { root };
  } catch (e) {
    if (e instanceof SyntaxProblem) return { error: { message: e.message, offset: e.offset } };
    throw e;
  }
}

/** 0-based line and column of an offset. */
export function positionAt(text: string, offset: number): { line: number; column: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    } else if (text[i] === '\r' && text[i + 1] !== '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: Math.min(offset, text.length) - lineStart };
}
