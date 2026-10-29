import { describe, expect, test } from 'bun:test';
import type { OrgSettings } from '@harnesys/contracts';
import { OrgSettingsSchema } from '@harnesys/contracts';
import type { CapabilityScope } from 'harnesys';
import { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';
import { OrgSchedulerPort } from './org-scheduler.port.ts';
import { MemoryAgents, MemorySchedules, MemoryThreads } from './wire-org-packs.fakes.ts';

class FakeOrgSettings extends OrgSettingsPort {
  timezone = 'UTC';

  get(): OrgSettings {
    return OrgSettingsSchema.parse({ timezone: this.timezone });
  }

  set(_orgId: string, patch: Partial<OrgSettings>): OrgSettings {
    return OrgSettingsSchema.parse(patch);
  }
}

const SCOPE: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  threadId: 'thread-1',
  sourceIds: [],
};

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

function setup(timezone: string) {
  const schedules = new MemorySchedules();
  const threads = new MemoryThreads();
  const agents = new MemoryAgents();
  const orgSettings = new FakeOrgSettings();
  orgSettings.timezone = timezone;
  const agent = agents.insert({
    id: 'agent-1',
    orgId: 'org-1',
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
  });
  const port = new OrgSchedulerPort({ schedules, threads, agents, orgSettings });
  return { port, schedules, threads, agents, orgSettings, agent };
}

describe('OrgSchedulerPort timezone', () => {
  test('create computes the next run at 09:00 of the org timezone', async () => {
    const h = setup('Europe/Moscow');
    const created = await h.port.create(SCOPE, {
      name: 'Daily',
      targetAgentId: h.agent.id,
      cron: '0 9 * * *',
    });
    const nextRunAt = created.schedule.nextRunAt ?? '';
    expect(localClock(nextRunAt, 'Europe/Moscow')).toBe('09:00');
    expect(localClock(nextRunAt, 'UTC')).toBe('06:00');
  });

  test('update recomputes the next run in the org timezone', async () => {
    const h = setup('Europe/Moscow');
    const created = await h.port.create(SCOPE, {
      name: 'Daily',
      targetAgentId: h.agent.id,
      cron: '0 9 * * *',
    });
    const updated = await h.port.update(SCOPE, created.schedule.id, { cron: '30 18 * * *' });
    const nextRunAt = updated.nextRunAt ?? '';
    expect(localClock(nextRunAt, 'Europe/Moscow')).toBe('18:30');
    expect(localClock(nextRunAt, 'UTC')).toBe('15:30');
  });
});
