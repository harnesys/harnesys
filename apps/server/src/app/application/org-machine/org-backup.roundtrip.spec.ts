import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { MachineOrgEntry } from '@harnesys/contracts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { FakeLayout } from '../../infra/addons/catalog/fake-layout.ts';
import { OrgBackupArchiveAdapter } from '../../infra/fs-layout/org-backup-archive.adapter.ts';
import { OrgDataPackAdapter } from '../../infra/fs-layout/org-data-pack.adapter.ts';
import { ensureOrgSchema } from '../../infra/org-sqlite/org-sql-ensure.ts';
import { ExportOrgBackupUseCase } from './export-org-backup.use-case.ts';
import { ImportOrgBackupUseCase } from './import-org-backup.use-case.ts';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const execFileAsync = promisify(execFile);

let layout: FakeLayout;
let store: MapOrgMachineStore;
const ensuredWorkspaces: string[] = [];
const upsertedMemberships: Array<{ userId: string; orgId: string }> = [];

beforeEach(() => {
  layout = new FakeLayout();
  store = new MapOrgMachineStore();
  store.upsert({ orgId: ORG_ID, name: 'Acme Org', description: '', role: 'relay' });
  layout.ensureOrgDataDir(ORG_ID);
  mkdirSync(join(layout.orgDataDir(ORG_ID), 'threads'), { recursive: true });
  writeFileSync(join(layout.orgDataDir(ORG_ID), 'threads', 'a.txt'), 'thread payload');
  createOrgDb(ORG_ID, 'Acme Org');
});

afterAll(() => {
  rmSync(layout.root, { recursive: true, force: true });
});

describe('OrgBackup roundtrip', () => {
  test('export produces an archive with manifest, org.db and data.tgz', async () => {
    const { archivePath } = await exportUseCase().execute({ orgId: ORG_ID });
    const unpacked = join(layout.root, 'inspect');
    mkdirSync(unpacked);
    await execFileAsync('tar', ['-xzf', archivePath, '-C', unpacked]);
    expect(readdirSync(unpacked).sort()).toEqual(['data.tgz', 'manifest.json', 'org.db']);
    const manifest = JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf8')) as {
      format: string;
      orgId: string;
      orgName: string;
    };
    expect(manifest.format).toBe('harnesys-org-backup');
    expect(manifest.orgId).toBe(ORG_ID);
    expect(manifest.orgName).toBe('Acme Org');
    rmSync(unpacked, { recursive: true, force: true });
  });

  test('import restores the organization after it is lost locally', async () => {
    const { archivePath } = await exportUseCase().execute({ orgId: ORG_ID });
    const bytes = new Uint8Array(readFileSync(archivePath));
    layout.removeOrgDir(ORG_ID);
    layout.removeOrgDataDir(ORG_ID);
    store.remove(ORG_ID);

    const result = await importUseCase().execute({ bytes, userId: USER_ID });

    expect(result.orgId).toBe(ORG_ID);
    expect(result.name).toBe('Acme Org');
    expect(result.role).toBe('relay');
    expect(store.get(ORG_ID)).toBeDefined();
    expect(
      upsertedMemberships.map((membership) => ({
        userId: membership.userId,
        orgId: membership.orgId,
      })),
    ).toEqual([{ userId: USER_ID, orgId: ORG_ID }]);
    expect(ensuredWorkspaces).toContain(ORG_ID);
    const db = new Database(layout.orgDbPath(ORG_ID), { readonly: true });
    const row = db.query('SELECT id, name FROM orgs').get() as { id: string; name: string };
    db.close();
    expect(row.id).toBe(ORG_ID);
    expect(row.name).toBe('Acme Org');
    expect(readFileSync(join(layout.orgDataDir(ORG_ID), 'threads', 'a.txt'), 'utf8')).toBe(
      'thread payload',
    );
  });

  test('import rejects when the organization id already exists', async () => {
    const { archivePath } = await exportUseCase().execute({ orgId: ORG_ID });
    const bytes = new Uint8Array(readFileSync(archivePath));
    await expect(importUseCase().execute({ bytes, userId: USER_ID })).rejects.toThrow(
      'already exists',
    );
  });

  test('import rejects a corrupted org.db even when the size matches', async () => {
    const { archivePath } = await exportUseCase().execute({ orgId: ORG_ID });
    layout.removeOrgDir(ORG_ID);
    layout.removeOrgDataDir(ORG_ID);
    store.remove(ORG_ID);
    const tampered = await repackWithTamperedDb(archivePath);
    const bytes = new Uint8Array(readFileSync(tampered));
    await expect(importUseCase().execute({ bytes, userId: USER_ID })).rejects.toThrow('checksum');
  });

  test('import rejects an archive without a valid manifest', async () => {
    const staging = join(layout.root, 'no-manifest');
    mkdirSync(staging);
    writeFileSync(join(staging, 'org.db'), 'not a database');
    const archivePath = join(layout.root, 'no-manifest.tar.gz');
    await execFileAsync('tar', ['-czf', archivePath, '-C', staging, 'org.db']);
    const bytes = new Uint8Array(readFileSync(archivePath));
    await expect(importUseCase().execute({ bytes, userId: USER_ID })).rejects.toThrow('manifest');
  });
});

function exportUseCase(): ExportOrgBackupUseCase {
  return new ExportOrgBackupUseCase(
    store,
    specOrgDb(),
    new OrgDataPackAdapter(layout),
    new OrgBackupArchiveAdapter(),
  );
}

function importUseCase(): ImportOrgBackupUseCase {
  return new ImportOrgBackupUseCase(
    store,
    layout,
    specOrgDb(),
    new OrgDataPackAdapter(layout),
    new OrgBackupArchiveAdapter(),
    { ensureLocalDefault: () => undefined } as never,
    { get: () => ({ id: 'host-1', name: 'spec-host' }) } as never,
    {
      upsert: (membership: { userId: string; orgId: string }) => {
        upsertedMemberships.push(membership);
      },
    } as never,
    {
      execute: (orgId: string) => {
        ensuredWorkspaces.push(orgId);
      },
    } as never,
  );
}

function createOrgDb(orgId: string, name: string): void {
  layout.ensureOrgDir(orgId);
  const sqlite = new Database(layout.orgDbPath(orgId), { create: true });
  ensureOrgSchema(
    (sql) => {
      sqlite.exec(sql);
    },
    (sql) => sqlite.query(sql).all() as { name: string }[],
  );
  sqlite
    .query('INSERT OR REPLACE INTO orgs (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(orgId, name, new Date().toISOString(), new Date().toISOString());
  sqlite.close();
}

function specOrgDb(): OrgDbPortLike {
  return {
    bootstrap: (orgId: string, name: string) => {
      createOrgDb(orgId, name);
    },
    rename: () => undefined,
    snapshot: (orgId: string, outPath: string) => {
      const sqlite = new Database(layout.orgDbPath(orgId), { readonly: true });
      sqlite.exec(`VACUUM INTO '${outPath}'`);
      sqlite.close();
    },
  };
}

interface OrgDbPortLike {
  bootstrap(orgId: string, name: string): void;
  rename(orgId: string, name: string): void;
  snapshot(orgId: string, outPath: string): void;
}

class MapOrgMachineStore extends OrgMachineStore {
  private readonly entries = new Map<string, MachineOrgEntry>();
  private activeOrgId: string | null = null;

  list(): MachineOrgEntry[] {
    return [...this.entries.values()];
  }

  upsert(entry: MachineOrgEntry): void {
    this.entries.set(entry.orgId, entry);
  }

  remove(orgId: string): void {
    this.entries.delete(orgId);
  }

  getActive(): string | null {
    return this.activeOrgId;
  }

  setActive(orgId: string | null): void {
    this.activeOrgId = orgId;
  }

  get(orgId: string): MachineOrgEntry | undefined {
    return this.entries.get(orgId);
  }
}

async function repackWithTamperedDb(archivePath: string): Promise<string> {
  const unpacked = join(layout.root, 'tamper');
  mkdirSync(unpacked);
  await execFileAsync('tar', ['-xzf', archivePath, '-C', unpacked]);
  const dbPath = join(unpacked, 'org.db');
  const original = readFileSync(dbPath);
  const tampered = Buffer.from(original);
  for (let i = 0; i < tampered.length; i += 4096) {
    tampered[i] = (tampered[i] ?? 0) ^ 0xff;
  }
  writeFileSync(dbPath, tampered);
  const outPath = join(layout.root, 'tampered.tar.gz');
  await execFileAsync('tar', [
    '-czf',
    outPath,
    '-C',
    unpacked,
    'manifest.json',
    'org.db',
    'data.tgz',
  ]);
  rmSync(unpacked, { recursive: true, force: true });
  return outPath;
}
