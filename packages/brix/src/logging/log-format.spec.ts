import { describe, expect, test } from 'bun:test';
import type { LogRecord } from './log-format';
import { formatLogLine } from './log-format';

const TIME = new Date(2026, 8, 30, 12, 0, 0, 123).getTime();

function makeRecord(fields: Record<string, unknown>): LogRecord {
  return { level: 30, time: TIME, msg: 'request', ...fields } as LogRecord;
}

describe('formatLogLine', () => {
  test('renders timestamp, padded level and message', () => {
    expect(formatLogLine(makeRecord({ msg: 'server listening' }), { color: false })).toBe(
      '2026-09-30 12:00:00.123 INFO  server listening',
    );
  });

  test('renders warn and error levels with their names', () => {
    expect(formatLogLine(makeRecord({ level: 40, msg: 'slow' }), { color: false })).toBe(
      '2026-09-30 12:00:00.123 WARN  slow',
    );
    expect(formatLogLine(makeRecord({ level: 50, msg: 'boom' }), { color: false })).toBe(
      '2026-09-30 12:00:00.123 ERROR boom',
    );
  });

  test('renders the context bracket', () => {
    expect(formatLogLine(makeRecord({ context: 'App', msg: 'started' }), { color: false })).toBe(
      '2026-09-30 12:00:00.123 INFO  [App] started',
    );
  });

  test('renders payload fields and skips meta fields', () => {
    const line = formatLogLine(
      makeRecord({
        method: 'GET',
        path: '/health/live',
        statusCode: 200,
        pid: 7,
        hostname: 'pc',
        name: 'server',
      }),
      { color: false },
    );
    expect(line).toBe(
      '2026-09-30 12:00:00.123 INFO  request method=GET path=/health/live statusCode=200',
    );
  });

  test('quotes strings with spaces and compacts objects', () => {
    const line = formatLogLine(
      makeRecord({ note: 'hello world', payload: { a: 1 }, empty: null }),
      { color: false },
    );
    expect(line).toBe(
      '2026-09-30 12:00:00.123 INFO  request note="hello world" payload={"a":1} empty=null',
    );
  });

  test('renders an error field inline with the stack below', () => {
    const line = formatLogLine(
      makeRecord({
        level: 50,
        msg: 'onModuleDestroy hooks failed',
        err: { type: 'Error', message: 'boom', stack: 'Error: boom\n    at stop (app.ts:1:1)' },
      }),
      { color: false },
    );
    expect(line).toBe(
      [
        '2026-09-30 12:00:00.123 ERROR onModuleDestroy hooks failed err=Error: boom',
        '    at stop (app.ts:1:1)',
      ].join('\n'),
    );
  });

  test('colors levels and decorations when enabled', () => {
    const line = formatLogLine(makeRecord({ level: 50, msg: 'boom', traceId: 't1' }), {
      color: true,
    });
    expect(line).toBe(
      [
        '\u001b[90m2026-09-30 12:00:00.123\u001b[0m',
        '\u001b[31;1mERROR\u001b[0m',
        'boom',
        '\u001b[90mtraceId=t1\u001b[0m',
      ].join(' '),
    );
  });

  test('falls back to the numeric level for unknown levels', () => {
    expect(formatLogLine(makeRecord({ level: 70, msg: 'custom' }), { color: false })).toBe(
      '2026-09-30 12:00:00.123 70    custom',
    );
  });
});
