import { Injectable } from '@harnesys/brix';
import type { ListOrgCapabilitiesResponse } from '@harnesys/contracts';
import { listOrgPackCatalog } from './org-pack-catalog.ts';

export interface ListOrgCapabilitiesRequest {
  orgId: string;
}

@Injectable()
export class ListOrgCapabilitiesUseCase {
  execute(_request: ListOrgCapabilitiesRequest): ListOrgCapabilitiesResponse {
    return { capabilities: listOrgPackCatalog() };
  }
}
