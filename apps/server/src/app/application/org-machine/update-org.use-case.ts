import { Injectable } from '@harnesys/brix';
import type { MachineOrgEntry } from '@harnesys/contracts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNameRequiredException, OrgNotFoundException } from '../../domain/org/org.error.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';

export interface UpdateOrgInput {
  orgId: string;
  name?: string;
  description?: string;
}

@Injectable()
export class UpdateOrgUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly orgDb: OrgDbPort,
  ) {}

  execute(input: UpdateOrgInput): MachineOrgEntry {
    const existing = this.store.get(input.orgId);
    if (!existing) {
      throw new OrgNotFoundException(input.orgId);
    }
    let name = existing.name;
    if (input.name !== undefined) {
      name = input.name.trim();
      if (!name) {
        throw new OrgNameRequiredException();
      }
    }
    const description =
      input.description !== undefined ? input.description.slice(0, 500) : existing.description;
    const entry: MachineOrgEntry = { ...existing, name, description };
    if (existing.role === 'relay' && name !== existing.name) {
      this.orgDb.rename(input.orgId, name);
    }
    this.store.upsert(entry);
    return entry;
  }
}
