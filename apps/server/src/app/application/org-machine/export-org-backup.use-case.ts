import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { ORG_BACKUP_FORMAT, ORG_BACKUP_VERSION, type OrgBackupManifest } from '@harnesys/contracts';
import { OrgBackupArchivePort } from '../../domain/machine/org-backup-archive.port.ts';
import { OrgDataPackPort } from '../../domain/machine/org-data-pack.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';

export interface ExportOrgBackupInput {
  orgId: string;
}

export interface OrgBackupArchiveResult {
  archivePath: string;
  fileName: string;
}

const ARCHIVE_TEMP_LIFETIME_MS = 120_000;

@Injectable()
export class ExportOrgBackupUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly orgDb: OrgDbPort,
    private readonly dataPack: OrgDataPackPort,
    private readonly archive: OrgBackupArchivePort,
  ) {}

  async execute(input: ExportOrgBackupInput): Promise<OrgBackupArchiveResult> {
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    const workDir = mkdtempSync(join(tmpdir(), 'harnesys-org-backup-'));
    try {
      const staging = join(workDir, 'staging');
      mkdirSync(staging);
      const stagedDb = join(staging, 'org.db');
      this.orgDb.snapshot(input.orgId, stagedDb);
      const stagedData = join(staging, 'data.tgz');
      const packed = await this.dataPack.pack(input.orgId, stagedData);
      const manifest: OrgBackupManifest = {
        format: ORG_BACKUP_FORMAT,
        version: ORG_BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        orgId: entry.orgId,
        orgName: entry.name,
        orgDb: {
          sizeBytes: statSync(stagedDb).size,
          sha256: await this.archive.hashFile(stagedDb),
        },
        data: packed
          ? {
              sizeBytes: statSync(stagedData).size,
              sha256: await this.archive.hashFile(stagedData),
            }
          : null,
      };
      writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
      const fileName = `harnesys-org-${orgNameSlug(entry.name)}-${archiveStamp()}.tar.gz`;
      const archivePath = join(workDir, fileName);
      const files = ['manifest.json', 'org.db', ...(packed ? ['data.tgz'] : [])];
      await this.archive.create(files, staging, archivePath);
      scheduleCleanup(workDir);
      return { archivePath, fileName };
    } catch (error) {
      rmSync(workDir, { recursive: true, force: true });
      throw error;
    }
  }
}

function scheduleCleanup(workDir: string): void {
  setTimeout(() => {
    rmSync(workDir, { recursive: true, force: true });
  }, ARCHIVE_TEMP_LIFETIME_MS).unref();
}

function orgNameSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  );
}

function archiveStamp(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}
