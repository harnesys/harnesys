import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { LogFileOptions } from '../config/logging-binding';

export interface LogFileStore {
  exists(path: string): boolean;
  size(path: string): number;
  append(path: string, chunk: string): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
  close?(): void;
}

export function createLogFileStore(): LogFileStore {
  let fd: number | undefined;
  return {
    exists(path: string): boolean {
      return existsSync(path);
    },
    size(path: string): number {
      return statSync(path).size;
    },
    append(path: string, chunk: string): void {
      if (fd === undefined) {
        mkdirSync(dirname(path), { recursive: true });
        fd = openSync(path, 'a');
      }
      writeSync(fd, chunk);
    },
    rename(from: string, to: string): void {
      renameSync(from, to);
    },
    remove(path: string): void {
      rmSync(path, { force: true });
    },
    close(): void {
      if (fd !== undefined) {
        closeSync(fd);
        fd = undefined;
      }
    },
  };
}

function archivePath(path: string, index: number): string {
  return `${path}.${index}`;
}

export class RotatingLogFile {
  private sizeBytes = 0;
  private closed = false;

  constructor(
    private readonly options: LogFileOptions,
    private readonly store: LogFileStore = createLogFileStore(),
  ) {
    this.sizeBytes = this.store.exists(options.path) ? this.store.size(options.path) : 0;
  }

  write(chunk: string): void {
    if (this.closed) {
      return;
    }
    const bytes = Buffer.byteLength(chunk);
    if (this.sizeBytes > 0 && this.sizeBytes + bytes > this.options.maxSizeBytes) {
      this.rotate();
    }
    this.store.append(this.options.path, chunk);
    this.sizeBytes += bytes;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.store.close?.();
  }

  private rotate(): void {
    const { path, maxFiles } = this.options;
    this.store.close?.();
    if (maxFiles <= 1) {
      this.store.remove(path);
      this.sizeBytes = 0;
      return;
    }
    this.store.remove(archivePath(path, maxFiles - 1));
    for (let index = maxFiles - 2; index >= 1; index -= 1) {
      const source = archivePath(path, index);
      if (this.store.exists(source)) {
        this.store.rename(source, archivePath(path, index + 1));
      }
    }
    if (this.store.exists(path)) {
      this.store.rename(path, archivePath(path, 1));
    }
    this.sizeBytes = 0;
  }
}
