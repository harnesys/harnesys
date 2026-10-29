import { Controller, Get, Param } from '@harnesys/brix';
import type { ListOrgCapabilitiesResponse, ListOrgToolsResponse } from '@harnesys/contracts';
import { ListOrgCapabilitiesUseCase } from '../../application/capabilities/list-org-capabilities.use-case.ts';
import { ListOrgToolsUseCase } from '../../application/capabilities/list-org-tools.use-case.ts';

@Controller('orgs/:orgId')
export class CapabilitiesController {
  constructor(
    private readonly listCapabilities: ListOrgCapabilitiesUseCase,
    private readonly listTools: ListOrgToolsUseCase,
  ) {}

  @Get('capabilities')
  capabilities(@Param('orgId') orgId: string): ListOrgCapabilitiesResponse {
    return this.listCapabilities.execute({ orgId });
  }

  @Get('tools')
  tools(@Param('orgId') orgId: string): ListOrgToolsResponse {
    return this.listTools.execute({ orgId });
  }
}
