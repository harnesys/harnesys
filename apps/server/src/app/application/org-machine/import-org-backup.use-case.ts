import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { MachineOrgEntry, OrgBackupFileDigest, OrgBackupManifest } from '@harnesys/contracts';
import { OrgBackupManifestSchema } from '@harnesys/contracts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { ROLE_PRESETS } from '../../domain/identity/role-presets.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgBackupArchivePort } from '../../domain/machine/org-backup-archive.port.ts';
import { OrgDataPackPort } from '../../domain/machine/org-data-pack.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import {
  OrgBackupConflictException,
  OrgBackupInvalidException,
} from '../../domain/org/org.error.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';
import { EnsureWorkspaceUseCase } from '../source/ensure-workspace.use-case.ts';

export interface ImportOrgBackupInput {
  bytes: Uint8Array;
  userId: string;
}

@Injectable()
export class ImportOrgBackupUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly layout: HostFsLayoutPort,
    private readonly orgDb: OrgDbPort,
    private readonly dataPack: OrgDataPackPort,
    private readonly archive: OrgBackupArchivePort,
    private readonly profiles: ExecutionProfilePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly memberships: MembershipRepository,
    private readonly ensureWorkspace: EnsureWorkspaceUseCase,
  ) {}

  async execute(input: ImportOrgBackupInput): Promise<MachineOrgEntry> {
    const workDir = mkdtempSync(join(tmpdir(), 'harnesys-org-restore-'));
    let restoredOrgId: string | null = null;
    try {
      const sourceArchive = join(workDir, 'backup.tar.gz');
      writeFileSync(sourceArchive, input.bytes);
      const unpacked = join(workDir, 'unpacked');
      mkdirSync(unpacked);
      await this.archive.extract(sourceArchive, unpacked);
      const manifest = this.readManifest(unpacked);
      this.assertAvailable(manifest.orgId);
      await this.verifyArchiveEntry(join(unpacked, 'org.db'), manifest.orgDb, 'org.db');
      if (manifest.data) {
        await this.verifyArchiveEntry(join(unpacked, 'data.tgz'), manifest.data, 'data.tgz');
      }
      this.layout.ensureOrgDir(manifest.orgId);
      copyFileSync(join(unpacked, 'org.db'), this.layout.orgDbPath(manifest.orgId));
      restoredOrgId = manifest.orgId;
      if (manifest.data) {
        await this.dataPack.unpack(manifest.orgId, join(unpacked, 'data.tgz'));
      }
      return this.registerOrg(manifest.orgId, manifest.orgName, input.userId);
    } catch (error) {
      if (restoredOrgId !== null) {
        this.discardRestored(restoredOrgId);
      }
      throw error;
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  private readManifest(unpacked: string): OrgBackupManifest {
    const manifestPath = join(unpacked, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new OrgBackupInvalidException('manifest.json is missing');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      throw new OrgBackupInvalidException('manifest.json is not valid JSON');
    }
    const parsed = OrgBackupManifestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new OrgBackupInvalidException('manifest does not match the backup format');
    }
    return parsed.data;
  }

  private assertAvailable(orgId: string): void {
    if (this.store.get(orgId) !== undefined || existsSync(this.layout.orgDbPath(orgId))) {
      throw new OrgBackupConflictException(orgId);
    }
  }

  private async verifyArchiveEntry(
    path: string,
    expected: OrgBackupFileDigest,
    label: string,
  ): Promise<void> {
    if (!existsSync(path)) {
      throw new OrgBackupInvalidException(`${label} is missing from the archive`);
    }
    if (statSync(path).size !== expected.sizeBytes) {
      throw new OrgBackupInvalidException(`${label} size does not match the manifest`);
    }
    const sha256 = await this.archive.hashFile(path);
    if (sha256 !== expected.sha256) {
      throw new OrgBackupInvalidException(`${label} checksum does not match the manifest`);
    }
  }

  private registerOrg(orgId: string, name: string, userId: string): MachineOrgEntry {
    this.orgDb.bootstrap(orgId, name);
    this.ensureWorkspace.execute(orgId);
    const host = this.machineConfig.get();
    this.profiles.ensureLocalDefault(orgId, host.id);
    const entry: MachineOrgEntry = { orgId, name, description: '', role: 'relay' };
    this.store.upsert(entry);
    this.memberships.upsert({
      userId,
      orgId,
      capabilities: [...ROLE_PRESETS.owner],
      updatedAt: new Date().toISOString(),
    });
    return entry;
  }

  private discardRestored(orgId: string): void {
    this.layout.removeOrgDir(orgId);
    this.layout.removeOrgDataDir(orgId);
  }
}
