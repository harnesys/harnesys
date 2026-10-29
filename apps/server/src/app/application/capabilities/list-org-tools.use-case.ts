import { Injectable } from '@harnesys/brix';
import type { ListOrgToolsResponse } from '@harnesys/contracts';
import { listOrgCatalogTools } from './org-pack-catalog.ts';

export interface ListOrgToolsRequest {
  orgId: string;
}

@Injectable()
export class ListOrgToolsUseCase {
  execute(_request: ListOrgToolsRequest): ListOrgToolsResponse {
    return { tools: listOrgCatalogTools() };
  }
}
