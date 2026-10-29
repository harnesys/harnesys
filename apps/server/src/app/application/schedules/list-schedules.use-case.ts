import { Injectable } from '@harnesys/brix';
import type { ListSchedulesResponse } from '@harnesys/contracts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { toSchedulePublic } from './schedule.helpers.ts';

export interface ListSchedulesRequest {
  orgId: string;
}

@Injectable()
export class ListSchedulesUseCase {
  constructor(private readonly schedules: ScheduleRepositoryPort) {}

  execute(request: ListSchedulesRequest): ListSchedulesResponse {
    return {
      items: this.schedules.listByOrg(request.orgId).map(toSchedulePublic),
    };
  }
}
