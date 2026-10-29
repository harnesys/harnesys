import { describe, expect, test } from 'bun:test';
import type { ScheduleRecord } from '../../domain/schedule/schedule.ts';
import { FakeOrgSettings, FakeSchedules } from '../schedules/schedule.use-case.fakes.ts';
import { SetOrgSettingsUseCase } from './set-org-settings.use-case.ts';

const ORG_ID = 'org-1';

function schedule(id: string, cron: string, nextRunAt: string | null): ScheduleRecord {
  return {
    id,
    orgId: ORG_ID,
    name: id,
    status: 'active',
    targetAgentId: 'agent-1',
    detail: '',
    cron,
    modeId: 'default',
    history: 'none',
    historyLast: 1,
    missPolicy: 'catch-up',
    threadId: 'thread-1',
    nextRunAt,
    lastFiredAt: null,
    createdByUserId: null,
    createdAt: '2026-10-21T00:00:00.000Z',
    updatedAt: '2026-10-21T00:00:00.000Z',
  };
}

describe('SetOrgSettingsUseCase', () => {
  test('timezone change reschedules existing schedules in the new zone', () => {
    const settings = new FakeOrgSettings();
    const schedules = new FakeSchedules();
    schedules.items.set('s-1', schedule('s-1', '0 9 * * *', '2026-10-22T09:00:00.000Z'));
    const useCase = new SetOrgSettingsUseCase(settings, schedules);

    useCase.execute({ orgId: ORG_ID, patch: { timezone: 'Europe/Moscow' } });

    const next = schedules.items.get('s-1')?.nextRunAt ?? null;
    expect(next).not.toBeNull();
    expect(new Date(next ?? '').getUTCHours()).toBe(6);
  });

  test('other settings change leaves schedules untouched', () => {
    const settings = new FakeOrgSettings();
    const schedules = new FakeSchedules();
    schedules.items.set('s-1', schedule('s-1', '0 9 * * *', '2026-10-22T09:00:00.000Z'));
    const useCase = new SetOrgSettingsUseCase(settings, schedules);

    useCase.execute({ orgId: ORG_ID, patch: { skillsSourceAutoLoad: false } });

    expect(schedules.items.get('s-1')?.nextRunAt).toBe('2026-10-22T09:00:00.000Z');
  });
});
