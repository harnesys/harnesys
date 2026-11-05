import { describe, expect, test } from 'bun:test';
import {
  MemoryApprovalEvents,
  MemoryApprovalStore,
  MemoryPermissionRules,
} from '../approvals/approval-fakes.ts';
import {
  APPROVAL_ID,
  ASK_ID,
  buildUseCase,
  makeApproval,
  ORG,
  RUN_ID,
  StubExecutor,
  THREAD_ID,
} from './respond-run.use-case.fakes.ts';

describe('RespondRunUseCase', () => {
  test('respond resumes the session of the agent that owns the run', async () => {
    const store = new MemoryApprovalStore();
    const events = new MemoryApprovalEvents();
    store.seed(makeApproval());
    const executor = new StubExecutor();
    const uc = buildUseCase(store, events, executor);

    await uc.execute({
      orgId: ORG,
      threadId: THREAD_ID,
      runId: RUN_ID,
      body: { askId: ASK_ID, payload: { approved: true }, clientEventId: 'ev-agent' },
    });

    expect(executor.sessionCalls).toEqual([{ threadId: THREAD_ID, agentId: 'agent-1' }]);
  });

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

  test('always on a delegated op ask records the op rule for the delegate', async () => {
    const store = new MemoryApprovalStore();
    const events = new MemoryApprovalEvents();
    const rules = new MemoryPermissionRules();
    store.seed(
      makeApproval({
        context: {
          source: 'permission',
          ops: ['process'],
          delegated: { agentId: 'delegate-1', agentType: 'Spawn Tester 1' },
        },
      }),
    );
    const uc = buildUseCase(store, events, new StubExecutor(), rules);

    await uc.execute({
      orgId: ORG,
      threadId: THREAD_ID,
      runId: RUN_ID,
      body: {
        askId: ASK_ID,
        payload: { approved: true, scope: 'always' },
        clientEventId: 'ev-always',
      },
    });

    expect(rules.rows).toHaveLength(1);
    expect(rules.rows[0]).toMatchObject({ agentId: 'delegate-1', kind: 'op', pattern: 'process' });
  });

  test('approve once on a delegated op ask records no rule', async () => {
    const store = new MemoryApprovalStore();
    const events = new MemoryApprovalEvents();
    const rules = new MemoryPermissionRules();
    store.seed(
      makeApproval({
        context: {
          source: 'permission',
          ops: ['process'],
          delegated: { agentId: 'delegate-1' },
        },
      }),
    );
    const uc = buildUseCase(store, events, new StubExecutor(), rules);

    await uc.execute({
      orgId: ORG,
      threadId: THREAD_ID,
      runId: RUN_ID,
      body: {
        askId: ASK_ID,
        payload: { approved: true, scope: 'once' },
        clientEventId: 'ev-once',
      },
    });

    expect(rules.rows).toHaveLength(0);
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
