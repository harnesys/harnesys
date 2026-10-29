import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@harnesys/brix';
import type {
  CreateScheduleBody,
  CreateScheduleResponse,
  ListSchedulesResponse,
  SchedulePublic,
  UpdateScheduleBody,
} from '@harnesys/contracts';
import { CreateScheduleBodySchema, UpdateScheduleBodySchema } from '@harnesys/contracts';
import { CreateScheduleUseCase } from '../../application/schedules/create-schedule.use-case.ts';
import { DeleteScheduleUseCase } from '../../application/schedules/delete-schedule.use-case.ts';
import { ListSchedulesUseCase } from '../../application/schedules/list-schedules.use-case.ts';
import { UpdateScheduleUseCase } from '../../application/schedules/update-schedule.use-case.ts';
import { principalUserId } from '../../application/threads/run-attribution.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('orgs/:orgId/schedules')
export class SchedulesController {
  constructor(
    private readonly listSchedules: ListSchedulesUseCase,
    private readonly createSchedule: CreateScheduleUseCase,
    private readonly updateSchedule: UpdateScheduleUseCase,
    private readonly deleteSchedule: DeleteScheduleUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListSchedulesResponse {
    return this.listSchedules.execute({ orgId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @SessionPrincipal() principal: Principal,
    @Body(CreateScheduleBodySchema) body: CreateScheduleBody,
  ): CreateScheduleResponse {
    return this.createSchedule.execute({ orgId, actorUserId: principalUserId(principal), body });
  }

  @Patch(':scheduleId')
  update(
    @Param('orgId') orgId: string,
    @Param('scheduleId') scheduleId: string,
    @SessionPrincipal() principal: Principal,
    @Body(UpdateScheduleBodySchema) body: UpdateScheduleBody,
  ): SchedulePublic {
    return this.updateSchedule.execute({
      orgId,
      scheduleId,
      actorUserId: principalUserId(principal),
      body,
    });
  }

  @Delete(':scheduleId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('scheduleId') scheduleId: string): void {
    this.deleteSchedule.execute({ orgId, scheduleId });
  }
}
