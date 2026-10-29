import { Injectable } from '@harnesys/brix';
import type { OrgsListResponse } from '@harnesys/contracts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { ROLE_PRESETS } from '../../domain/identity/role-presets.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';

export interface ListOrgsInput {
  userId: string;
}

@Injectable()
export class ListOrgsUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly memberships: MembershipRepository,
    private readonly users: UserRepository,
  ) {}

  execute(input: ListOrgsInput): OrgsListResponse {
    this.repairCreatorMembership(input.userId);
    return {
      orgs: this.store.list(),
      activeOrgId: this.store.getActive(),
    };
  }

  private repairCreatorMembership(userId: string): void {
    if (this.users.count() !== 1 || !this.users.findById(userId)) {
      return;
    }
    for (const entry of this.store.list()) {
      if (entry.role !== 'relay' || this.memberships.listByOrg(entry.orgId).length > 0) {
        continue;
      }
      this.memberships.upsertSync({
        userId,
        orgId: entry.orgId,
        capabilities: [...ROLE_PRESETS.owner],
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
