import { Injectable } from '@harnesys/brix';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { ScheduleNotFoundException } from '../../domain/schedule/schedule.error.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { toDeskScheduleDeletedEvent } from './schedule.helpers.ts';

export interface DeleteScheduleRequest {
  orgId: string;
  scheduleId: string;
}

@Injectable()
export class DeleteScheduleUseCase {
  constructor(
    private readonly schedules: ScheduleRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly deskEvents: DeskEventsPort,
  ) {}

  execute(request: DeleteScheduleRequest): void {
    const current = this.schedules.findById(request.orgId, request.scheduleId);
    if (!current) {
      throw new ScheduleNotFoundException(request.scheduleId);
    }
    this.schedules.delete(request.orgId, current.id);
    const thread = this.threads.findById(request.orgId, current.threadId);
    if (thread?.kind === 'schedule') {
      this.threads.delete(request.orgId, thread.id);
    }
    this.deskEvents.emit(request.orgId, toDeskScheduleDeletedEvent(current.id));
  }
}
