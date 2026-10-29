import { describe, expect, test } from 'bun:test';
import type { AgentPatch, AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { ApprovalRecord } from '../../domain/approval/approval.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import type {
  ModePresetInsert,
  ModePresetPatch,
  ModePresetRecord,
} from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import {
  MemoryApprovalEvents,
  StubEventClaims,
  StubFileRules,
  StubMachineConfig,
  StubNodeCommands,
  StubSourceLocation,
  silentLogger,
} from './approval-fakes.ts';
import { DecideApprovalUseCase } from './decide-approval.use-case.ts';
import { RecordingExecutor } from './local-executor-fakes.ts';

function fileApprovalRow(): ApprovalRecord {
  return {
    id: 'approval-1',
    runId: 'run-1',
    agentId: 'agent-1',
    threadId: 'thread-1',
    interruptId: 'int-1',
    kind: 'file_access',
    question: 'allow fs.write?',
    options: ['approve', 'approve_once', 'block_path'],
    context: {
      source: 'permission',
      ops: ['fs.write'],
      file: {
        host: 'host-1',
        canonicalPath: '/w/keep.ts',
        requestedPath: 'keep.ts',
        action: 'edit',
        runtime: 'host',
      },
    },
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    decisionSeq: 0,
    resumeState: 'pending',
    createdAt: new Date(0).toISOString(),
  };
}

class StoreStub extends ApprovalStorePort {
  row: ApprovalRecord | null = fileApprovalRow();
  readonly decisions: string[] = [];
  request(): { id: string } {
    throw new Error('not used');
  }
  decide(
    _orgId: string,
    input: { approvalId: string; decision: string },
  ): { winner: boolean; status: 'approved' } {
    this.decisions.push(input.decision);
    return { winner: true, status: 'approved' };
  }
  list(): ApprovalRecord[] {
    return [];
  }
  get(): ApprovalRecord | null {
    return this.row;
  }
  getByRunInterrupt(): ApprovalRecord | null {
    return null;
  }
  markRunCancelled(): ApprovalRecord[] {
    return [];
  }
  listResumable(): ApprovalRecord[] {
    return [];
  }
  markResumeApplied(): ApprovalRecord | null {
    return null;
  }
  markResumeCancelled(): ApprovalRecord | null {
    return null;
  }
}

class AgentsStub extends AgentRegistryPort {
  list(): AgentRecord[] {
    return [];
  }
  findById(): AgentRecord | undefined {
    return undefined;
  }
  findByName(): AgentRecord | undefined {
    return undefined;
  }
  insert(_rec: AgentRecord): AgentRecord {
    throw new Error('not used');
  }
  update(_orgId: string, _id: string, _patch: AgentPatch): AgentRecord {
    throw new Error('not used');
  }
  delete(): void {}
}

class ModesStub extends ModePresetRegistryPort {
  list(): ModePresetRecord[] {
    return [];
  }
  findById(): ModePresetRecord | undefined {
    return undefined;
  }
  insert(_rec: ModePresetInsert): ModePresetRecord {
    throw new Error('not used');
  }
  update(_orgId: string, _id: string, _patch: ModePresetPatch): ModePresetRecord {
    throw new Error('not used');
  }
  delete(): void {}
  ensureSeeded(): void {}
}

describe('DecideApprovalUseCase file access', () => {
  test('command rules stay out of file rules and block_path denies with a file rule', async () => {
    const store = new StoreStub();
    const fileRules = new StubFileRules();
    const executor = new RecordingExecutor();
    const useCase = new DecideApprovalUseCase(
      store,
      new MemoryApprovalEvents(),
      executor,
      new StubEventClaims(),
      new StubNodeCommands(),
      new AgentsStub(),
      new ModesStub(),
      fileRules,
      new StubMachineConfig(),
      new StubSourceLocation(),
      silentLogger(),
    );

    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve',
        surface: 'web',
        rule: { kind: 'exact', pattern: 'git status', target: 'agent' },
      },
    });
    expect(fileRules.inserted).toHaveLength(0);

    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: { decision: 'block_path', surface: 'web' },
    });
    expect(store.decisions).toEqual(['approve', 'block_path']);
    expect(fileRules.inserted).toEqual([
      {
        orgId: 'org-1',
        agentId: 'agent-1',
        hostId: 'host-1',
        pathPattern: '/w/keep.ts',
        action: 'edit',
        effect: 'deny',
      },
    ]);
    expect(executor.rejected).toEqual(['int-1']);
    expect(executor.responded).toEqual(['int-1']);
  });
});
