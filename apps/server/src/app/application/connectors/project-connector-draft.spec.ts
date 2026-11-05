import { describe, expect, test } from 'bun:test';
import type {
  ConnectorDeliveryInsert,
  ConnectorDeliveryRecord,
} from '../../domain/connector/connector.ts';
import { FakeTelegram, memoryConnector } from './connector.fakes.ts';
import {
  appendDraftText,
  type DraftSendDeps,
  draftStateFromConnector,
} from './project-connector-draft.ts';

class DeliverySink {
  readonly deliveries: ConnectorDeliveryRecord[] = [];

  upsertDelivery(_orgId: string, rec: ConnectorDeliveryInsert): ConnectorDeliveryRecord {
    const existing = this.deliveries.findIndex(
      (row) =>
        row.connectorId === rec.connectorId &&
        row.runId === rec.runId &&
        row.blockKey === rec.blockKey,
    );
    if (existing >= 0) {
      this.deliveries[existing] = { ...rec };
    } else {
      this.deliveries.push({ ...rec });
    }
    return { ...rec };
  }
}

function draftDeps(sink: DeliverySink): DraftSendDeps {
  return {
    connectors: sink,
    telegram: new FakeTelegram(),
    now: () => 1_000,
    sleep: async () => {},
  };
}

const CONNECTOR = memoryConnector({ id: 'c1', provider: 'telegram' });

const RESUME_DELIVERY: ConnectorDeliveryRecord = {
  id: 'd1',
  connectorId: 'c1',
  bindingId: 'b1',
  threadId: 't1',
  runId: 'r1',
  blockKey: 'text:0',
  interruptId: null,
  draftId: 1,
  lastText: 'already sent',
  lastSeq: 42,
  externalMessageId: '900',
  status: 'streaming',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('connector draft cursor', () => {
  test('resuming a delivery keeps the sent message and the applied seq', () => {
    const state = draftStateFromConnector(CONNECTOR, {
      orgId: 'org-1',
      bindingId: 'b1',
      threadId: 't1',
      runId: 'r1',
      chatId: 'chat-1',
      topicId: null,
      token: 'token',
      delivery: RESUME_DELIVERY,
    });

    expect(state.deliveryId).toBe('d1');
    expect(state.externalMessageId).toBe('900');
    expect(state.pending).toBe('already sent');
    expect(state.lastSeq).toBe(42);
  });

  test('persisted delivery carries the last applied seq', async () => {
    const sink = new DeliverySink();
    const state = draftStateFromConnector(CONNECTOR, {
      orgId: 'org-1',
      bindingId: 'b1',
      threadId: 't1',
      runId: 'r1',
      chatId: 'chat-1',
      topicId: null,
      token: 'token',
      delivery: RESUME_DELIVERY,
    });
    state.lastSeq = 43;

    await appendDraftText(draftDeps(sink), state, ' plus');

    expect(sink.deliveries).toHaveLength(1);
    expect(sink.deliveries[0]?.lastSeq).toBe(43);
    expect(sink.deliveries[0]?.lastText).toBe('already sent plus');
    expect(sink.deliveries[0]?.externalMessageId).toBe('900');
  });
});
