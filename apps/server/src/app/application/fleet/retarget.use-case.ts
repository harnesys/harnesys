import { Injectable, ValidationException } from '@harnesys/brix';
import { NotWorkerOrgException } from '../../domain/fleet/fleet.error.ts';
import { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';

export interface RetargetInput {
  orgId: string;
  relayUrl: string;
}

@Injectable()
export class RetargetUseCase {
  constructor(
    private readonly identities: NodeIdentityStore,
    private readonly store: OrgMachineStore,
  ) {}

  execute(input: RetargetInput): { ok: true; relayUrl: string } {
    const relayUrl = input.relayUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(relayUrl)) {
      throw new ValidationException('relayUrl must start with http:// or https://');
    }
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    if (entry.role !== 'worker') {
      throw new NotWorkerOrgException(input.orgId);
    }
    const identity = this.identities.read(input.orgId);
    if (!identity) {
      throw new NotWorkerOrgException(input.orgId);
    }
    this.identities.write({ ...identity, relayUrl });
    this.store.upsert({ ...entry, relayUrl });
    return { ok: true, relayUrl };
  }
}
