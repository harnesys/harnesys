import { Injectable } from '@harnesys/brix';
import type { ActiveInvite } from '@harnesys/contracts';
import { NotRelayOrgException } from '../../domain/fleet/fleet.error.ts';
import { InviteRepository } from '../../domain/fleet/invite-repository.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';

@Injectable()
export class ListInvitesUseCase {
  constructor(
    private readonly invites: InviteRepository,
    private readonly store: OrgMachineStore,
  ) {}

  execute(orgId: string): ActiveInvite[] {
    const entry = this.store.get(orgId);
    if (!entry) {
      throw new OrgNotFoundException(orgId);
    }
    if (entry.role !== 'relay') {
      throw new NotRelayOrgException(orgId);
    }
    return this.invites.listActive(orgId, new Date().toISOString()).map((row) => ({
      inviteId: row.id,
      nodeName: row.nodeName,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    }));
  }
}
