import { Controller, Get, Param, UseGuards } from '@harnesys/brix';
import type { ListAutomationKindsResponse, ListAutomationsResponse } from '@harnesys/contracts';
import { ListAutomationKindsUseCase } from '../../application/automations/list-automation-kinds.use-case.ts';
import { ListAutomationsUseCase } from '../../application/automations/list-automations.use-case.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/automations')
export class AutomationsController {
  constructor(
    private readonly listAutomations: ListAutomationsUseCase,
    private readonly listAutomationKinds: ListAutomationKindsUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListAutomationsResponse {
    return this.listAutomations.execute({ orgId });
  }

  @Get('kinds')
  kinds(@Param('orgId') orgId: string): ListAutomationKindsResponse {
    return this.listAutomationKinds.execute(orgId);
  }
}
