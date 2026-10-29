import { describe, expect, test } from 'bun:test';
import type { ApprovalRecord } from '../../domain/approval/approval.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import {
  MemoryApprovalEvents,
  StubEventClaims,
  StubFileRules,
  StubMachineConfig,
  StubNodeCommands,
  StubSourceLocation,
  silentLogger,
} from './approval-fakes.ts';
import { AgentsStub, ModesStub } from './approval-registry-fakes.ts';
import { DecideApprovalUseCase } from './decide-approval.use-case.ts';
import { RecordingExecutor } from './local-executor-fakes.ts';

class RowStoreStub extends ApprovalStorePort {
  readonly decided: string[] = [];

  constructor(readonly row: ApprovalRecord) {
    super();
  }

  request(): never {
    throw new Error('not used');
  }

  decide(_orgId: string, input: { approvalId: string }): { winner: boolean; status: 'denied' } {
    this.decided.push(input.approvalId);
    return { winner: true, status: 'denied' };
  }

  list(): [] {
    return [];
  }

  get(): ApprovalRecord | null {
    return this.row;
  }

  getByRunInterrupt(): null {
    return null;
  }

  markRunCancelled(): [] {
    return [];
  }

  listResumable(): [] {
    return [];
  }

  markResumeApplied(): null {
    return null;
  }

  markResumeCancelled(): null {
    return null;
  }
}

function pendingRow(): ApprovalRecord {
  return {
    id: 'approval-1',
    runId: 'run-1',
    agentId: 'agent-1',
    threadId: 'thread-1',
    interruptId: 'int-1',
    kind: 'tool',
    question: 'run bun test?',
    options: ['approve', 'approve_once', 'deny'],
    context: { source: 'permission' },
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    decisionSeq: 0,
    resumeState: 'pending',
    createdAt: new Date(0).toISOString(),
  };
}

interface Built {
  useCase: DecideApprovalUseCase;
  executor: RecordingExecutor;
}

function build(row: ApprovalRecord): Built {
  const executor = new RecordingExecutor();
  const useCase = new DecideApprovalUseCase(
    new RowStoreStub(row),
    new MemoryApprovalEvents(),
    executor,
    new StubEventClaims(),
    new StubNodeCommands(),
    new AgentsStub(),
    new ModesStub(),
    new StubFileRules(),
    new StubMachineConfig(),
    new StubSourceLocation(),
    silentLogger(),
  );
  return { useCase, executor };
}

describe('DecideApprovalUseCase resume', () => {
  test('deny forwards the note to session.reject', async () => {
    const { useCase, executor } = build(pendingRow());
    const result = await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: { decision: 'deny', surface: 'web', note: 'wrong file' },
    });
    expect(result.winner).toBe(true);
    expect(executor.rejected).toEqual(['int-1']);
    expect(executor.rejectedNotes).toEqual(['wrong file']);
  });

  test('deny without a note leaves the note undefined', async () => {
    const { useCase, executor } = build(pendingRow());
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: { decision: 'deny', surface: 'web' },
    });
    expect(executor.rejected).toEqual(['int-1']);
    expect(executor.rejectedNotes).toEqual([undefined]);
  });
});
