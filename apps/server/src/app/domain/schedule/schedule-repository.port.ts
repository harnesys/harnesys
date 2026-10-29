import type {
  ScheduleFireRecord,
  ScheduleInsert,
  SchedulePatch,
  ScheduleRecord,
} from './schedule.ts';

export abstract class ScheduleRepositoryPort {
  abstract listByOrg(orgId: string): ScheduleRecord[];
  abstract listDue(orgId: string, nowIso: string): ScheduleRecord[];
  abstract findById(orgId: string, id: string): ScheduleRecord | undefined;
  abstract findByThreadId(orgId: string, threadId: string): ScheduleRecord | undefined;
  abstract listFiresBySchedule(orgId: string, scheduleId: string): ScheduleFireRecord[];
  abstract insert(rec: ScheduleInsert): ScheduleRecord;
  abstract update(orgId: string, id: string, patch: SchedulePatch): ScheduleRecord;
  abstract delete(orgId: string, id: string): void;
  abstract claimFire(orgId: string, fireId: string, scheduleId: string): boolean;
  abstract recordFireRun(orgId: string, fireId: string, runId: string): void;
  abstract releaseFire(orgId: string, fireId: string): void;
}
