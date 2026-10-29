import type { MachineOrgEntry } from '@harnesys/contracts';

export abstract class OrgMachineStore {
  abstract list(): MachineOrgEntry[];
  abstract upsert(entry: MachineOrgEntry): void;
  abstract remove(orgId: string): void;
  abstract getActive(): string | null;
  abstract setActive(orgId: string | null): void;
  abstract get(orgId: string): MachineOrgEntry | undefined;
}
