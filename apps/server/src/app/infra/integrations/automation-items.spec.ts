import { expect, test } from 'bun:test';
import type { AutomationUpsertInput } from 'harnesys/integration';
import type { ScheduleRecord } from '../../domain/schedule/schedule.ts';
import type { WebhookRecord } from '../../domain/webhook/webhook.ts';
import {
  AutomationSnapshots,
  mergeAutomationItems,
  toAutomationKindContributions,
} from './automation-items.ts';

function scheduleFixture(overrides: Partial<ScheduleRecord> = {}): ScheduleRecord {
  return {
    id: 'sch-1',
    orgId: 'org-1',
    name: 'Morning digest',
    status: 'active',
    targetAgentId: 'agent-1',
    detail: 'Summarize overnight',
    cron: '0 9 * * *',
    modeId: 'default',
    history: 'none',
    historyLast: 1,
    missPolicy: 'catch-up',
    threadId: 'thread-1',
    nextRunAt: '2026-11-07T09:00:00.000Z',
    lastFiredAt: null,
    createdByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    ...overrides,
  };
}

function webhookFixture(overrides: Partial<WebhookRecord> = {}): WebhookRecord {
  return {
    id: 'wh-1',
    orgId: 'org-1',
    name: 'Deploy hook',
    status: 'paused',
    targetAgentId: 'agent-1',
    detail: '',
    endpoint: '/api/orgs/org-1/hooks/wh-1',
    threadId: 'thread-2',
    lastFiredAt: null,
    createdByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...overrides,
  };
}

const feedItem: AutomationUpsertInput = {
  id: 'feed-1',
  kind: 'telegram.feed',
  label: 'News channel',
  status: 'active',
  threadId: 'thread-3',
  targetAgentId: 'agent-2',
  meta: { source: 'news' },
};

test('core schedules and webhooks map to automation items', () => {
  const items = mergeAutomationItems({
    orgId: 'org-1',
    schedules: [scheduleFixture()],
    webhooks: [webhookFixture()],
    addons: [],
  });
  expect(items).toHaveLength(2);
  const schedule = items.find((item) => item.kind === 'schedule');
  expect(schedule?.integrationId).toBe('core');
  expect(schedule?.label).toBe('Morning digest');
  expect(schedule?.status).toBe('active');
  expect(schedule?.connection).toEqual({ required: false, connected: true });
  expect(schedule?.meta).toEqual({ cron: '0 9 * * *', nextRunAt: '2026-11-07T09:00:00.000Z' });
  expect(schedule?.availableAt).toBe('2026-11-07T09:00:00.000Z');
  const webhook = items.find((item) => item.kind === 'webhook');
  expect(webhook?.status).toBe('paused');
  expect(webhook?.meta).toEqual({ endpoint: '/api/orgs/org-1/hooks/wh-1' });
  expect(webhook?.availableAt).toBeNull();
});

test('schedule item drops null nextRunAt from meta', () => {
  const items = mergeAutomationItems({
    orgId: 'org-1',
    schedules: [scheduleFixture({ nextRunAt: null })],
    webhooks: [],
    addons: [],
  });
  expect(items[0]?.meta).toEqual({ cron: '0 9 * * *' });
  expect(items[0]?.availableAt).toBeNull();
});

test('addon snapshots replace on publish and feed the merged read-model', () => {
  const snapshots = new AutomationSnapshots();
  snapshots.publish('org-1', 'telegram', [feedItem]);
  snapshots.publish('org-1', 'telegram', [
    { ...feedItem, id: 'feed-2', label: 'Dev channel' },
    { ...feedItem, id: 'feed-3' },
  ]);
  snapshots.publish('org-2', 'telegram', [feedItem]);
  const orgEntries = snapshots.forOrg('org-1');
  expect(orgEntries).toHaveLength(1);
  const entries = orgEntries[0];
  expect(entries?.items.map((item) => item.id)).toEqual(['feed-2', 'feed-3']);
  const items = mergeAutomationItems({
    orgId: 'org-1',
    schedules: [],
    webhooks: [],
    addons: [
      {
        integrationId: 'telegram',
        connection: { required: true, connected: true },
        items: entries?.items ?? [],
      },
    ],
  });
  expect(items).toHaveLength(2);
  expect(items[0]?.integrationId).toBe('telegram');
  expect(items[0]?.kind).toBe('telegram.feed');
  expect(items[0]?.connection).toEqual({ required: true, connected: true });
  expect(items[0]?.description).toBe('');
  expect(items[1]?.threadId).toBe('thread-3');
});

test('integration kind contributions default from connection presence', () => {
  const kinds = toAutomationKindContributions({
    id: 'telegram',
    title: 'Telegram',
    version: '1.0.0',
    connection: async () => ({ connected: false }),
    automationKinds: [{ kind: 'telegram.feed', label: 'Feed' }],
  });
  expect(kinds).toEqual([
    {
      kind: 'telegram.feed',
      integrationId: 'telegram',
      source: 'integration',
      label: 'Feed',
      description: '',
      icon: 'zap',
      requiresConnection: true,
      connected: true,
    },
  ]);
});
