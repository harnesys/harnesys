import { describe, expect, test } from 'bun:test';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { ApprovalValidationException } from '../../domain/approval/approval.error.ts';
import type { ApprovalRecord } from '../../domain/approval/approval.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import type { ModePresetRecord } from '../../domain/mode-presets/mode-preset.ts';
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
import { StubLocalExecutor } from './local-executor-fakes.ts';

function approvalRow(): ApprovalRecord {
  return {
    id: 'approval-1',
    runId: 'run-1',
    agentId: 'agent-1',
    threadId: null,
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

function agentRecord(config: Record<string, unknown>): AgentRecord {
  return {
    id: 'agent-1',
    orgId: 'org-1',
    name: 'coder',
    role: 'coder',
    instructions: 'code',
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
    config,
    hooks: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function presetRecord(): ModePresetRecord {
  return {
    orgId: 'org-1',
    id: 'plan',
    name: 'Plan',
    description: 'plan mode',
    instructions: '',
    skills: [],
    packs: {},
    permissions: { process: 'deny' },
    builtin: true,
    installedByDefault: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

class StoreStub extends ApprovalStorePort {
  row: ApprovalRecord | null = approvalRow();
  readonly decided: string[] = [];
  request(): { id: string } {
    throw new Error('not used');
  }
  decide(_orgId: string, input: { approvalId: string }): { winner: boolean; status: 'approved' } {
    this.decided.push(input.approvalId);
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

function shellAllowlistOf(config: Record<string, unknown>): unknown {
  const packs = config.capabilitiesJson as Record<string, unknown>;
  const shell = packs.shell as Record<string, unknown>;
  const spec = shell.spec as Record<string, unknown>;
  return spec.allowlist;
}

function build(): {
  useCase: DecideApprovalUseCase;
  store: StoreStub;
  agents: AgentsStub;
  modes: ModesStub;
  fileRules: StubFileRules;
} {
  const store = new StoreStub();
  const agents = new AgentsStub();
  agents.agent = agentRecord({
    capabilitiesJson: { shell: { spec: { allowlist: ['git status'] } } },
  });
  const modes = new ModesStub();
  const fileRules = new StubFileRules();
  const useCase = new DecideApprovalUseCase(
    store,
    new MemoryApprovalEvents(),
    new StubLocalExecutor(),
    new StubEventClaims(),
    new StubNodeCommands(),
    agents,
    modes,
    fileRules,
    new StubMachineConfig(),
    new StubSourceLocation(),
    silentLogger(),
  );
  return { useCase, store, agents, modes, fileRules };
}

describe('DecideApprovalUseCase rule persistence', () => {
  test('approve with agent rule appends to the agent shell allowlist', async () => {
    const { useCase, agents, modes } = build();
    const result = await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve',
        surface: 'web',
        rule: { kind: 'program', pattern: 'bun *', target: 'agent' },
      },
    });
    expect(result.winner).toBe(true);
    expect(agents.updates).toHaveLength(1);
    expect(shellAllowlistOf(agents.updates[0]?.config ?? {})).toEqual(['git status', 'bun *']);
    expect(modes.updates).toHaveLength(0);
  });

  test('duplicate pattern is not duplicated', async () => {
    const { useCase, agents } = build();
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve',
        surface: 'web',
        rule: { kind: 'exact', pattern: 'git status', target: 'agent' },
      },
    });
    expect(agents.updates).toHaveLength(0);
  });

  test('floor pattern throws and persists nothing', async () => {
    const { useCase, store, agents, modes } = build();
    const promise = useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve',
        surface: 'web',
        rule: { kind: 'prefix', pattern: 'rm -rf /*', target: 'agent' },
      },
    });
    await expect(promise).rejects.toBeInstanceOf(ApprovalValidationException);
    expect(store.decided).toHaveLength(0);
    expect(agents.updates).toHaveLength(0);
    expect(modes.updates).toHaveLength(0);
  });

  test('approve_once with a rule calls no update', async () => {
    const { useCase, agents, modes } = build();
    const result = await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve_once',
        surface: 'web',
        rule: { kind: 'program', pattern: 'bun *', target: 'agent' },
      },
    });
    expect(result.winner).toBe(true);
    expect(agents.updates).toHaveLength(0);
    expect(modes.updates).toHaveLength(0);
  });

  test('deny with a rule calls no update', async () => {
    const { useCase, agents, modes } = build();
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'deny',
        surface: 'web',
        rule: { kind: 'program', pattern: 'bun *', target: 'agent' },
      },
    });
    expect(agents.updates).toHaveLength(0);
    expect(modes.updates).toHaveLength(0);
  });

  test('global rule merges into the default mode preset', async () => {
    const { useCase, agents, modes } = build();
    if (agents.agent) {
      agents.agent = { ...agents.agent, defaultModeId: 'plan' };
    }
    modes.preset = presetRecord();
    const result = await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve',
        surface: 'web',
        rule: { kind: 'program', pattern: 'bun *', target: 'global' },
      },
    });
    expect(result.winner).toBe(true);
    expect(modes.updates).toHaveLength(1);
    const packs = modes.updates[0]?.packs as Record<string, unknown>;
    const shell = packs.shell as Record<string, unknown>;
    const spec = shell.spec as Record<string, unknown>;
    expect(spec.allowlist).toEqual(['bun *']);
    expect(agents.updates).toHaveLength(0);
  });

  test('global rule falls back to the agent spec without a default mode', async () => {
    const { useCase, agents, modes } = build();
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve',
        surface: 'web',
        rule: { kind: 'program', pattern: 'bun *', target: 'global' },
      },
    });
    expect(agents.updates).toHaveLength(1);
    expect(modes.updates).toHaveLength(0);
  });
});
