import { Injectable } from '@harnesys/brix';
import type { ListOrgToolsResponse } from '@harnesys/contracts';
import { PackRegistryPort } from '../../domain/capabilities/pack-registry.port.ts';
import { listOrgCatalogTools } from './org-pack-catalog.ts';

export interface ListOrgToolsRequest {
  orgId: string;
}

@Injectable()
export class ListOrgToolsUseCase {
  constructor(private readonly packs: PackRegistryPort) {}

  execute(_request: ListOrgToolsRequest): ListOrgToolsResponse {
    return { tools: listOrgCatalogTools(this.packs) };
  }
}
