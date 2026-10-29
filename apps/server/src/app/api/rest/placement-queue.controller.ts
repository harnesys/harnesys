import { Controller, Get, Param } from '@harnesys/brix';
import type { PlacementQueueResponse } from '@harnesys/contracts';
import { ListPlacementQueueUseCase } from '../../application/fleet/list-placement-queue.use-case.ts';
import { OrgIdHeader } from '../org-id.ts';

@Controller('fleet')
export class PlacementQueueController {
  constructor(private readonly listPlacementQueue: ListPlacementQueueUseCase) {}

  @Get('profiles/:profileId/queue')
  profileQueue(
    @OrgIdHeader() orgId: string,
    @Param('profileId') profileId: string,
  ): PlacementQueueResponse {
    return this.listPlacementQueue.execute({ orgId, profileId });
  }
}
