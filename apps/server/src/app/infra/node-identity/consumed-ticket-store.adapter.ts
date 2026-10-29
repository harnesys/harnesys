import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { ConsumedTicketStore } from '../../domain/machine/consumed-ticket-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

const FILE_MODE = 0o600;
const WORKER_CONSUMED_SUFFIX = '.tickets-consumed.json';
const RELAY_CONSUMED_FILE = 'tickets-consumed.json';

interface ConsumedTicketFile {
  version: 1;
  tickets: Record<string, number>;
}

@Injectable()
export class ConsumedTicketStoreAdapter extends ConsumedTicketStore {
  private readonly loaded = new Map<string, Map<string, number>>();

  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  has(orgId: string, jti: string): boolean {
    const entries = this.entriesFor(orgId);
    const expiresAtSec = entries.get(jti);
    if (expiresAtSec === undefined) {
      return false;
    }
    if (!isLive(expiresAtSec)) {
      entries.delete(jti);
      return false;
    }
    return true;
  }

  consume(orgId: string, jti: string, expiresAtSec: number): void {
    const entries = this.entriesFor(orgId);
    entries.set(jti, expiresAtSec);
    this.persist(orgId, entries);
  }

  private entriesFor(orgId: string): Map<string, number> {
    let entries = this.loaded.get(orgId);
    if (!entries) {
      entries = this.load(orgId);
      this.loaded.set(orgId, entries);
    }
    return entries;
  }

  private load(orgId: string): Map<string, number> {
    const path = this.pathFor(orgId);
    if (!existsSync(path)) {
      return new Map();
    }
    const out = new Map<string, number>();
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as ConsumedTicketFile;
      for (const [jti, expiresAtSec] of Object.entries(parsed.tickets)) {
        if (isLive(expiresAtSec)) {
          out.set(jti, expiresAtSec);
        }
      }
    } catch {
      out.clear();
    }
    return out;
  }

  private persist(orgId: string, entries: Map<string, number>): void {
    const path = this.pathFor(orgId);
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const file: ConsumedTicketFile = { version: 1, tickets: pruneToLive(entries) };
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: FILE_MODE });
    chmodSync(path, FILE_MODE);
  }

  private pathFor(orgId: string): string {
    const identityPath = this.layout.nodeIdentityPath(orgId);
    if (existsSync(identityPath)) {
      return join(this.layout.nodesDir(), `${orgId}${WORKER_CONSUMED_SUFFIX}`);
    }
    return join(this.layout.orgDir(orgId), RELAY_CONSUMED_FILE);
  }
}

function isLive(expiresAtSec: number): boolean {
  return expiresAtSec * 1000 > Date.now();
}

function pruneToLive(entries: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [jti, expiresAtSec] of entries) {
    if (isLive(expiresAtSec)) {
      out[jti] = expiresAtSec;
    }
  }
  return out;
}
