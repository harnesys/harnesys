import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import type { AddonLogEntry, LogLevelValue } from '../services/sinks.ts';
import { LogSink } from '../services/sinks.ts';
import { addonDataDirOf } from './addon-db-access.adapter.ts';

export const ADDON_LOG_RING_SIZE = 2000;
const ROTATE_BYTES = 10 * 1024 * 1024;
const ROTATE_KEEP = 3;
const SENSITIVE_KEY = /auth|token|secret|password|credential/i;

export interface StoredAddonLogLine {
  seq: number;
  at: string;
  level: LogLevelValue;
  message: string;
  fields: Record<string, unknown>;
}

export function redactAddonLogValue(value: string): string {
  return value.replace(
    /(authorization|auth|token|secret|password|credential)(["']?\s*[:=]\s*["']?)([^\s"'&]+)/gi,
    (_match, key: string, sep: string) => `${key}${sep}***`,
  );
}

function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = SENSITIVE_KEY.test(key) ? '***' : value;
  }
  return output;
}

interface AddonLogBuffer {
  lines: StoredAddonLogLine[];
  seq: number;
}

@Injectable()
export class AddonLogSinkAdapter extends LogSink {
  private readonly buffers = new Map<string, AddonLogBuffer>();

  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override append(entry: AddonLogEntry): void {
    const key = `${entry.orgId}/${entry.addonId}`;
    const buffer = this.bufferOf(key);
    buffer.seq += 1;
    const line: StoredAddonLogLine = {
      seq: buffer.seq,
      at: entry.at,
      level: entry.level,
      message: redactAddonLogValue(entry.message),
      fields: redactFields(entry.fields ?? {}),
    };
    buffer.lines.push(line);
    if (buffer.lines.length > ADDON_LOG_RING_SIZE) {
      buffer.lines.shift();
    }
    this.appendToFile(entry, line);
  }

  tail(orgId: string, addonId: string, since: number): StoredAddonLogLine[] {
    const buffer = this.buffers.get(`${orgId}/${addonId}`);
    if (!buffer) {
      return [];
    }
    return buffer.lines.filter((line) => line.seq > since);
  }

  private bufferOf(key: string): AddonLogBuffer {
    const existing = this.buffers.get(key);
    if (existing) {
      return existing;
    }
    const buffer: AddonLogBuffer = { lines: [], seq: 0 };
    this.buffers.set(key, buffer);
    return buffer;
  }

  private appendToFile(entry: AddonLogEntry, line: StoredAddonLogLine): void {
    const dir = join(addonDataDirOf(this.layout, entry.orgId, entry.addonId), 'logs');
    const file = join(dir, 'addon.log');
    try {
      mkdirSync(dir, { recursive: true });
      this.rotateIfNeeded(file);
      appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8');
    } catch {
      // File logging is best-effort; the in-memory ring buffer stays authoritative.
    }
  }

  private rotateIfNeeded(file: string): void {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      return;
    }
    if (size < ROTATE_BYTES) {
      return;
    }
    for (let index = ROTATE_KEEP - 1; index >= 1; index -= 1) {
      try {
        renameSync(`${file}.${index}`, `${file}.${index + 1}`);
      } catch {
        // Missing older segments are fine.
      }
    }
    try {
      renameSync(file, `${file}.1`);
    } catch {
      // Best-effort rotation.
    }
  }
}
