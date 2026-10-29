import { Injectable, ValidationException } from '@harnesys/brix';
import type { EnrollResponse, PairResponse } from '@harnesys/contracts';
import {
  AlreadyEnrolledException,
  InviteInvalidException,
} from '../../domain/fleet/fleet.error.ts';
import { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';

export interface PairWithRelayInput {
  relayUrl: string;
  inviteCode: string;
  nodeName: string;
  orgId: string;
}

@Injectable()
export class PairWithRelayUseCase {
  constructor(
    private readonly identities: NodeIdentityStore,
    private readonly store: OrgMachineStore,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  async execute(input: PairWithRelayInput): Promise<PairResponse> {
    const relayUrl = input.relayUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(relayUrl)) {
      throw new ValidationException('relayUrl must start with http:// or https://');
    }
    if (this.identities.read(input.orgId) || this.store.get(input.orgId)) {
      throw new AlreadyEnrolledException(input.orgId);
    }
    const nodeName =
      input.nodeName.trim() !== '' ? input.nodeName.trim() : this.machineConfig.get().name;
    let response: Response;
    try {
      response = await fetch(`${relayUrl}/api/fleet/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Org-Id': input.orgId,
        },
        body: JSON.stringify({
          code: input.inviteCode,
          nodeName,
          nodeId: this.machineConfig.get().id,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ValidationException(`relay is not reachable at ${relayUrl}`);
    }
    if (response.status === 401) {
      throw new InviteInvalidException();
    }
    if (!response.ok) {
      const preview = (await response.text().catch(() => '')).slice(0, 160);
      throw new ValidationException(`enroll failed with HTTP ${response.status}: ${preview}`);
    }
    const body = (await response.json()) as EnrollResponse;
    if (typeof body.nodeId !== 'string' || typeof body.token !== 'string') {
      throw new ValidationException('unexpected enroll response');
    }
    const orgName = typeof body.orgName === 'string' && body.orgName ? body.orgName : nodeName;
    const description = typeof body.description === 'string' ? body.description.slice(0, 500) : '';
    if (typeof body.ticketKey !== 'string' || !body.ticketKey) {
      throw new ValidationException('unexpected enroll response');
    }
    this.identities.write({
      orgId: input.orgId,
      nodeId: body.nodeId,
      nodeName,
      role: 'worker',
      relayUrl,
      token: body.token,
      ticketKey: body.ticketKey,
    });
    this.store.upsert({
      orgId: input.orgId,
      name: orgName,
      description,
      role: 'worker',
      relayUrl,
    });
    this.store.setActive(input.orgId);
    return { ok: true, nodeId: body.nodeId, orgId: input.orgId, orgName };
  }
}
