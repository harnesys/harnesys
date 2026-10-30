import { describe, expect, test } from 'bun:test';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { CreateScheduleUseCase } from './create-schedule.use-case.ts';
import {
  FakeAgents,
  FakeDeskEvents,
  FakeOrgSettings,
  FakeSchedules,
  FakeThreads,
} from './schedule.use-case.fakes.ts';
import { UpdateScheduleUseCase } from './update-schedule.use-case.ts';

const ORG_ID = crypto.randomUUID();

function agentRecord(): AgentRecord {
  return {
    id: crypto.randomUUID(),
    orgId: ORG_ID,
    name: 'Agent',
    role: 'manager',
    instructions: '',
    modelId: 'model-1',
    budgetUsdDaily: null,
    level: 'top',
    parentId: null,
    executionProfileId: null,
    status: 'active',
    sharedSourceIds: [],
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: null,
    config: {},
    hooks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function localClock(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const values = new Map(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  return `${values.get('hour')}:${values.get('minute')}`;
}

function harness(timezone: string) {
  const schedules = new FakeSchedules();
  const threads = new FakeThreads();
  const agents = new FakeAgents();
  const orgSettings = new FakeOrgSettings();
  orgSettings.timezone = timezone;
  const agent = agents.insert(agentRecord());
  const deskEvents = new FakeDeskEvents();
  const create = new CreateScheduleUseCase(schedules, threads, agents, orgSettings, deskEvents);
  const update = new UpdateScheduleUseCase(schedules, threads, agents, orgSettings, deskEvents);
  return { schedules, threads, agents, orgSettings, agent, create, update };
}

describe('schedule next run in the org timezone', () => {
  test('create computes the next run at 09:00 of the org timezone', () => {
    const h = harness('Europe/Moscow');
    const created = h.create.execute({
      orgId: ORG_ID,
      body: { name: 'Daily', targetAgentId: h.agent.id, cron: '0 9 * * *' },
    });
    const nextRunAt = created.schedule.nextRunAt ?? '';
    expect(localClock(nextRunAt, 'Europe/Moscow')).toBe('09:00');
    expect(localClock(nextRunAt, 'UTC')).toBe('06:00');
  });

  test('create computes the next run in UTC when the org timezone is UTC', () => {
    const h = harness('UTC');
    const created = h.create.execute({
      orgId: ORG_ID,
      body: { name: 'Daily', targetAgentId: h.agent.id, cron: '0 9 * * *' },
    });
    const nextRunAt = created.schedule.nextRunAt ?? '';
    expect(localClock(nextRunAt, 'UTC')).toBe('09:00');
  });

  test('update recomputes the next run in the org timezone', () => {
    const h = harness('Europe/Moscow');
    const created = h.create.execute({
      orgId: ORG_ID,
      body: { name: 'Daily', targetAgentId: h.agent.id, cron: '0 9 * * *' },
    });
    const updated = h.update.execute({
      orgId: ORG_ID,
      scheduleId: created.schedule.id,
      body: { cron: '30 18 * * *' },
    });
    const nextRunAt = updated.nextRunAt ?? '';
    expect(localClock(nextRunAt, 'Europe/Moscow')).toBe('18:30');
    expect(localClock(nextRunAt, 'UTC')).toBe('15:30');
  });
});
