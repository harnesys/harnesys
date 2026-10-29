import { execFile } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { OrgDataPackPort } from '../../domain/machine/org-data-pack.port.ts';

const execFileAsync = promisify(execFile);

@Injectable()
export class OrgDataPackAdapter extends OrgDataPackPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  async pack(orgId: string, outPath: string): Promise<boolean> {
    const dataDir = this.layout.orgDataDir(orgId);
    if (!existsSync(dataDir)) {
      return false;
    }
    const parent = join(dataDir, '..');
    await execFileAsync('tar', ['-czf', `${outPath}.tmp`, '-C', parent, orgId]);
    renameSync(`${outPath}.tmp`, outPath);
    return true;
  }

  async unpack(orgId: string, archivePath: string): Promise<void> {
    this.layout.ensureOrgDataDir(orgId);
    const parent = join(this.layout.orgDataDir(orgId), '..');
    await execFileAsync('tar', ['-xzf', archivePath, '-C', parent]);
  }
}
