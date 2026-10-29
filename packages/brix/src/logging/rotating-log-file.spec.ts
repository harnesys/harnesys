import { describe, expect, test } from 'bun:test';
import type { LogFileStore } from './rotating-log-file';
import { RotatingLogFile } from './rotating-log-file';

class MemoryLogFileStore implements LogFileStore {
  readonly files = new Map<string, string>();
  readonly events: string[] = [];

  exists(path: string): boolean {
    return this.files.has(path);
  }

  size(path: string): number {
    return (this.files.get(path) ?? '').length;
  }

  append(path: string, chunk: string): void {
    this.events.push(`append:${path}`);
    this.files.set(path, `${this.files.get(path) ?? ''}${chunk}`);
  }

  rename(from: string, to: string): void {
    this.events.push(`rename:${from}>${to}`);
    const content = this.files.get(from) ?? '';
    this.files.delete(from);
    this.files.set(to, content);
  }

  remove(path: string): void {
    this.events.push(`remove:${path}`);
    this.files.delete(path);
  }

  close(): void {
    this.events.push('close');
  }
}

describe('RotatingLogFile', () => {
  test('appends chunks and tracks size', () => {
    const store = new MemoryLogFileStore();
    const file = new RotatingLogFile(
      { path: 'logs/app.log', maxSizeBytes: 100, maxFiles: 3 },
      store,
    );

    file.write('aaa\n');
    file.write('bbb\n');

    expect(store.files.get('logs/app.log')).toBe('aaa\nbbb\n');
  });

  test('counts the size of an existing file before rotating', () => {
    const store = new MemoryLogFileStore();
    store.files.set('logs/app.log', 'xxxxxxxxxx');
    const file = new RotatingLogFile(
      { path: 'logs/app.log', maxSizeBytes: 14, maxFiles: 3 },
      store,
    );

    file.write('yyyy\n');

    expect(store.files.get('logs/app.log')).toBe('yyyy\n');
    expect(store.files.get('logs/app.log.1')).toBe('xxxxxxxxxx');
  });

  test('rotates when the next chunk would exceed the limit', () => {
    const store = new MemoryLogFileStore();
    const file = new RotatingLogFile({ path: 'logs/app.log', maxSizeBytes: 6, maxFiles: 3 }, store);

    file.write('aaa\n');
    file.write('bbb\n');

    expect(store.files.get('logs/app.log')).toBe('bbb\n');
    expect(store.files.get('logs/app.log.1')).toBe('aaa\n');
  });

  test('shifts archives and drops the oldest beyond maxFiles', () => {
    const store = new MemoryLogFileStore();
    const file = new RotatingLogFile({ path: 'logs/app.log', maxSizeBytes: 4, maxFiles: 3 }, store);

    file.write('1111\n');
    file.write('2222\n');
    file.write('3333\n');
    file.write('4444\n');

    expect(store.files.get('logs/app.log')).toBe('4444\n');
    expect(store.files.get('logs/app.log.1')).toBe('3333\n');
    expect(store.files.get('logs/app.log.2')).toBe('2222\n');
    expect(store.files.has('logs/app.log.3')).toBe(false);
  });

  test('keeps only the active file when maxFiles is 1', () => {
    const store = new MemoryLogFileStore();
    const file = new RotatingLogFile({ path: 'logs/app.log', maxSizeBytes: 4, maxFiles: 1 }, store);

    file.write('1111\n');
    file.write('2222\n');

    expect(store.files.get('logs/app.log')).toBe('2222\n');
    expect(store.files.has('logs/app.log.1')).toBe(false);
  });

  test('releases the store before renaming during rotation', () => {
    const store = new MemoryLogFileStore();
    const file = new RotatingLogFile({ path: 'logs/app.log', maxSizeBytes: 4, maxFiles: 2 }, store);

    file.write('1111\n');
    file.write('2222\n');

    const closedAt = store.events.indexOf('close');
    const renamedAt = store.events.indexOf('rename:logs/app.log>logs/app.log.1');
    expect(closedAt).toBeGreaterThanOrEqual(0);
    expect(closedAt).toBeLessThan(renamedAt);
  });

  test('drops writes after close', () => {
    const store = new MemoryLogFileStore();
    const file = new RotatingLogFile(
      { path: 'logs/app.log', maxSizeBytes: 100, maxFiles: 2 },
      store,
    );

    file.write('aaa\n');
    file.close();
    file.write('bbb\n');

    expect(store.files.get('logs/app.log')).toBe('aaa\n');
  });

  test('close is idempotent', () => {
    const store = new MemoryLogFileStore();
    const file = new RotatingLogFile(
      { path: 'logs/app.log', maxSizeBytes: 100, maxFiles: 2 },
      store,
    );

    file.close();
    file.close();

    expect(store.events.filter((event) => event === 'close')).toHaveLength(1);
  });
});
