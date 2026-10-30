import { Injectable } from '@harnesys/brix';
import type { MachineOrgEntry } from '@harnesys/contracts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { ROLE_PRESETS } from '../../domain/identity/role-presets.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNameRequiredException } from '../../domain/org/org.error.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';
import { EnsureWorkspaceUseCase } from '../source/ensure-workspace.use-case.ts';

export interface CreateRelayOrgInput {
  name: string;
  userId: string;
  workspacePath?: string;
}

@Injectable()
export class CreateRelayOrgUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly orgDb: OrgDbPort,
    private readonly ensureWorkspace: EnsureWorkspaceUseCase,
    private readonly profiles: ExecutionProfilePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly memberships: MembershipRepository,
  ) {}

  execute(input: CreateRelayOrgInput): MachineOrgEntry {
    const name = input.name.trim();
    if (!name) {
      throw new OrgNameRequiredException();
    }
    const orgId = crypto.randomUUID();
    this.orgDb.bootstrap(orgId, name);
    this.ensureWorkspace.execute(orgId, { localPath: input.workspacePath });
    const host = this.machineConfig.get();
    this.profiles.ensureLocalDefault(orgId, host.id);
    const entry: MachineOrgEntry = { orgId, name, description: '', role: 'relay' };
    this.store.upsert(entry);
    if (this.store.getActive() === null) {
      this.store.setActive(orgId);
    }
    this.memberships.upsert({
      userId: input.userId,
      orgId,
      capabilities: [...ROLE_PRESETS.owner],
      updatedAt: new Date().toISOString(),
    });
    return entry;
  }
}
