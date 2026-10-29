import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Injectable } from '@harnesys/brix';
import {
  type MachineOrgEntry,
  type OrgMachineFile,
  OrgMachineFileSchema,
} from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';

const FILE_MODE = 0o600;

function emptyFile(): OrgMachineFile {
  return { version: 1, orgs: [], activeOrgId: null };
}

@Injectable()
export class OrgMachineStoreAdapter extends OrgMachineStore {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(): MachineOrgEntry[] {
    return this.read().orgs;
  }

  upsert(entry: MachineOrgEntry): void {
    const file = this.read();
    const index = file.orgs.findIndex((row) => row.orgId === entry.orgId);
    if (index === -1) {
      file.orgs.push(entry);
    } else {
      file.orgs[index] = entry;
    }
    this.write(file);
  }

  remove(orgId: string): void {
    const file = this.read();
    file.orgs = file.orgs.filter((row) => row.orgId !== orgId);
    if (file.activeOrgId === orgId) {
      file.activeOrgId = file.orgs[0]?.orgId ?? null;
    }
    this.write(file);
  }

  getActive(): string | null {
    return this.read().activeOrgId;
  }

  setActive(orgId: string | null): void {
    const file = this.read();
    file.activeOrgId = orgId;
    this.write(file);
  }

  get(orgId: string): MachineOrgEntry | undefined {
    return this.read().orgs.find((row) => row.orgId === orgId);
  }

  private read(): OrgMachineFile {
    const path = this.layout.machinePath();
    if (!existsSync(path)) {
      return emptyFile();
    }
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return OrgMachineFileSchema.parse(parsed);
  }

  private write(file: OrgMachineFile): void {
    this.layout.ensureHome();
    const path = this.layout.machinePath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: FILE_MODE });
    renameSync(tmp, path);
    chmodSync(path, FILE_MODE);
  }
}
