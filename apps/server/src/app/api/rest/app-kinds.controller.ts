import { Controller, Get } from '@harnesys/brix';
import type { AppKindsResponse } from '@harnesys/contracts';
import { ListAppKindsUseCase } from '../../application/apps/list-app-kinds.use-case.ts';

@Controller('orgs/:orgId/app-kinds')
export class AppKindsController {
  constructor(private readonly listKinds: ListAppKindsUseCase) {}

  @Get()
  list(): AppKindsResponse {
    return this.listKinds.execute();
  }
}
