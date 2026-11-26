import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';
import { archiveStamp, orgNameSlug, scheduleCleanup } from './export-org-backup.use-case.ts';

export interface ExportOrgDbInput {
  orgId: string;
}

export interface OrgDbFileResult {
  filePath: string;
  fileName: string;
}

@Injectable()
export class ExportOrgDbUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly orgDb: OrgDbPort,
  ) {}

  async execute(input: ExportOrgDbInput): Promise<OrgDbFileResult> {
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    const workDir = mkdtempSync(join(tmpdir(), 'harnesys-org-db-'));
    try {
      const fileName = `harnesys-org-db-${orgNameSlug(entry.name)}-${archiveStamp()}.db`;
      const filePath = join(workDir, fileName);
      this.orgDb.snapshot(input.orgId, filePath);
      scheduleCleanup(workDir);
      return { filePath, fileName };
    } catch (error) {
      rmSync(workDir, { recursive: true, force: true });
      throw error;
    }
  }
}
