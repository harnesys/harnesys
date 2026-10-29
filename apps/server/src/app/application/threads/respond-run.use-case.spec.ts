import { describe, expect, test } from 'bun:test';
import { MemoryApprovalEvents, MemoryApprovalStore } from '../approvals/approval-fakes.ts';
import {
  APPROVAL_ID,
  ASK_ID,
  buildUseCase,
  makeApproval,
  ORG,
  RUN_ID,
  THREAD_ID,
} from './respond-run.use-case.fakes.ts';

describe('RespondRunUseCase', () => {
  test('respond with approved:true and no rule → approval becomes approved + emit decided', async () => {
    const store = new MemoryApprovalStore();
    const events = new MemoryApprovalEvents();
    store.seed(makeApproval());
    const uc = buildUseCase(store, events);

    await uc.execute({
      orgId: ORG,
      threadId: THREAD_ID,
      runId: RUN_ID,
      body: { askId: ASK_ID, payload: { approved: true }, clientEventId: 'ev-1' },
    });

    const row = store.get(ORG, APPROVAL_ID);
    expect(row?.status).toBe('approved');
    expect(events.emitted).toHaveLength(1);
    expect(events.emitted[0]?.type).toBe('decided');
  });

  test('respond with approved:true and rule → approve + emit decided', async () => {
    const store = new MemoryApprovalStore();
    const events = new MemoryApprovalEvents();
    store.seed(makeApproval());
    const uc = buildUseCase(store, events);

    await uc.execute({
      orgId: ORG,
      threadId: THREAD_ID,
      runId: RUN_ID,
      body: {
        askId: ASK_ID,
        payload: { approved: true, rule: { kind: 'exact', pattern: 'ls', target: 'agent' } },
        clientEventId: 'ev-2',
      },
    });

    const row = store.get(ORG, APPROVAL_ID);
    expect(row?.status).toBe('approved');
    expect(events.emitted).toHaveLength(1);
  });

  test('reject → approval becomes denied + emit decided', async () => {
    const store = new MemoryApprovalStore();
    const events = new MemoryApprovalEvents();
    store.seed(makeApproval());
    const uc = buildUseCase(store, events);

    await uc.reject({
      orgId: ORG,
      threadId: THREAD_ID,
      runId: RUN_ID,
      body: { askId: ASK_ID, clientEventId: 'ev-3' },
    });

    const row = store.get(ORG, APPROVAL_ID);
    expect(row?.status).toBe('denied');
    expect(events.emitted).toHaveLength(1);
    expect(events.emitted[0]?.type).toBe('decided');
  });

  test('ask_user without inbox row — store not touched', async () => {
    const store = new MemoryApprovalStore();
    const events = new MemoryApprovalEvents();
    const uc = buildUseCase(store, events);

    await uc.execute({
      orgId: ORG,
      threadId: THREAD_ID,
      runId: RUN_ID,
      body: { askId: 'no-approval-for-this', payload: { text: 'hello' }, clientEventId: 'ev-4' },
    });

    expect(events.emitted).toHaveLength(0);
  });

  test('second decide after Inbox already closed — winner false, no extra emit', async () => {
    const store = new MemoryApprovalStore();
    const events = new MemoryApprovalEvents();
    store.seed(makeApproval());
    store.decide(ORG, { approvalId: APPROVAL_ID, decision: 'approve', surface: 'telegram' });
    const uc = buildUseCase(store, events);

    await uc.reject({
      orgId: ORG,
      threadId: THREAD_ID,
      runId: RUN_ID,
      body: { askId: ASK_ID, clientEventId: 'ev-5' },
    });

    expect(events.emitted).toHaveLength(0);
  });
});
