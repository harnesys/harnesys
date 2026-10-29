import { Injectable } from '@harnesys/brix';
import { InviteNotFoundException, NotRelayOrgException } from '../../domain/fleet/fleet.error.ts';
import { InviteRepository } from '../../domain/fleet/invite-repository.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';

@Injectable()
export class RevokeInviteUseCase {
  constructor(
    private readonly invites: InviteRepository,
    private readonly store: OrgMachineStore,
  ) {}

  execute(orgId: string, inviteId: string): void {
    const entry = this.store.get(orgId);
    if (!entry) {
      throw new OrgNotFoundException(orgId);
    }
    if (entry.role !== 'relay') {
      throw new NotRelayOrgException(orgId);
    }
    if (!this.invites.revoke(orgId, inviteId, new Date().toISOString())) {
      throw new InviteNotFoundException(inviteId);
    }
  }
}
