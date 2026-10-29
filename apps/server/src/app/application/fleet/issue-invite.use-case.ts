import { randomUUID } from 'node:crypto';
import { Injectable, ValidationException } from '@harnesys/brix';
import { INVITE_TTL_MIN_DEFAULT, INVITE_TTL_MIN_MAX, type IssuedInvite } from '@harnesys/contracts';
import {
  InviteRateLimitedException,
  NotRelayOrgException,
} from '../../domain/fleet/fleet.error.ts';
import { InviteRepository } from '../../domain/fleet/invite-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';
import { generateInviteCode } from './generate-invite-code.ts';
import { checkInviteRateLimit } from './invite-rate-limit.ts';
import { listenPortOf, relayUrlHint } from './relay-url-hint.ts';

export interface IssueInviteInput {
  orgId: string;
  nodeName: string;
  ttlMin?: number;
}

@Injectable()
export class IssueInviteUseCase {
  constructor(
    private readonly invites: InviteRepository,
    private readonly store: OrgMachineStore,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  execute(input: IssueInviteInput): IssuedInvite {
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    if (entry.role !== 'relay') {
      throw new NotRelayOrgException(input.orgId);
    }
    const nodeName = input.nodeName.trim();
    if (!nodeName) {
      throw new ValidationException('nodeName is required');
    }
    const ttlMin = input.ttlMin ?? INVITE_TTL_MIN_DEFAULT;
    if (!Number.isFinite(ttlMin) || ttlMin <= 0 || ttlMin > INVITE_TTL_MIN_MAX) {
      throw new ValidationException(`ttlMin must be within 1..${INVITE_TTL_MIN_MAX}`);
    }
    if (!checkInviteRateLimit(input.orgId)) {
      throw new InviteRateLimitedException();
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMin * 60_000).toISOString();
    let code = '';
    let inviteId = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      inviteId = randomUUID();
      code = generateInviteCode();
      try {
        this.invites.insert(input.orgId, {
          id: inviteId,
          code,
          nodeName,
          expiresAt,
          createdAt: now.toISOString(),
        });
        break;
      } catch {
        if (attempt === 4) {
          throw new ValidationException('invite code collision, retry');
        }
      }
    }
    const host = this.machineConfig.get();
    return {
      inviteId,
      code,
      expiresAt,
      relayUrlHint: relayUrlHint(host, listenPortOf(host)),
    };
  }
}
