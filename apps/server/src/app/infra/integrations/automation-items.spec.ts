import { expect, test } from 'bun:test';
import type { AutomationUpsertInput } from 'harnesys/integration';
import {
  AutomationSnapshots,
  mergeAutomationItems,
  toAutomationKindContributions,
} from './automation-items.ts';

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
  const items = mergeAutomationItems({ orgId: 'org-1', addons: [] });
  expect(items).toHaveLength(0);
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
      color: '',
      requiresConnection: true,
      connected: true,
    },
  ]);
});
