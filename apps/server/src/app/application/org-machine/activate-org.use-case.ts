import { Injectable } from '@harnesys/brix';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';

export interface ActivateOrgInput {
  orgId: string;
}

@Injectable()
export class ActivateOrgUseCase {
  constructor(private readonly store: OrgMachineStore) {}

  execute(input: ActivateOrgInput): void {
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    this.store.setActive(input.orgId);
  }
}
