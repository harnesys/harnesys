import { Injectable } from '@harnesys/brix';
import type { ListOrgCapabilitiesResponse } from '@harnesys/contracts';
import { PackRegistryPort } from '../../domain/capabilities/pack-registry.port.ts';
import { listOrgPackCatalog } from './org-pack-catalog.ts';

export interface ListOrgCapabilitiesRequest {
  orgId: string;
}

@Injectable()
export class ListOrgCapabilitiesUseCase {
  constructor(private readonly packs: PackRegistryPort) {}

  execute(_request: ListOrgCapabilitiesRequest): ListOrgCapabilitiesResponse {
    return { capabilities: listOrgPackCatalog(this.packs) };
  }
}
