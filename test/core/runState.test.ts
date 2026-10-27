import * as assert from 'assert';
import { describeRun, RunBook } from '../../src/core/runState';

describe('core/runState', () => {
  it('is idle until a task starts, then running', () => {
    const book = new RunBook();
    assert.strictEqual(book.get('a'), undefined);
    book.start('a');
    assert.strictEqual(book.get('a')?.status, 'running');
    assert.strictEqual(book.isRunning('a'), true);
    assert.strictEqual(book.isRunning('b'), false);
  });

  it('passes on exit code 0 and fails on another, keeping the result', () => {
    const book = new RunBook();
    book.start('a');
    book.end('a', 0, 1000);
    assert.deepStrictEqual(book.get('a'), { status: 'passed', active: 0, endedAt: 1000, exitCode: 0 });
    book.start('b');
    book.end('b', 2, 2000);
    assert.deepStrictEqual(book.get('b'), { status: 'failed', active: 0, endedAt: 2000, exitCode: 2 });
  });

  it('a new run clears the previous failure', () => {
    const book = new RunBook();
    book.start('a');
    book.end('a', 1, 1);
    book.start('a');
    assert.deepStrictEqual(book.get('a'), { status: 'running', active: 1 });
  });

  it('clears to idle when the task ends without an exit code', () => {
    const book = new RunBook();
    book.start('a');
    book.end('a', undefined, 1);
    assert.strictEqual(book.get('a'), undefined);
  });

  it('stays running while another run of the same task is active', () => {
    const book = new RunBook();
    book.start('a');
    book.start('a');
    book.end('a', 1, 1);
    assert.strictEqual(book.get('a')?.status, 'running');
    book.end('a', 0, 2);
    assert.strictEqual(book.get('a')?.status, 'passed');
  });

  it('counts an end it never saw start (the task began before the extension did)', () => {
    const book = new RunBook();
    book.end('a', 3, 5);
    assert.strictEqual(book.get('a')?.status, 'failed');
  });

  describe('describeRun', () => {
    it('says nothing before a run, and how to act while running', () => {
      assert.strictEqual(describeRun(undefined), undefined);
      assert.match(describeRun({ status: 'running', active: 1 }) ?? '', /^Running.*Ctrl\+click to restart/);
    });

    it('reports the last result with its time', () => {
      assert.match(describeRun({ status: 'passed', active: 0, endedAt: 0, exitCode: 0 }, 'en-US') ?? '', /^Last run passed at \d+:\d\d:\d\d/);
      assert.match(describeRun({ status: 'failed', active: 0, endedAt: 0, exitCode: 2 }, 'en-US') ?? '', /^Last run failed \(exit code 2\) at /);
    });
  });
});
