import { describe, expect, test } from 'bun:test';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { ApprovalValidationException } from '../../domain/approval/approval.error.ts';
import type { ApprovalDecideInput, ApprovalRecord } from '../../domain/approval/approval.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import type { PermissionRuleRecord } from '../../domain/permissions/permission-rule-store.port.ts';
import {
  MemoryApprovalEvents,
  MemoryPermissionRules,
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

function agentRecord(): AgentRecord {
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
    config: {},
    hooks: [],
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
  decide(
    _orgId: string,
    input: ApprovalDecideInput,
  ): { winner: boolean; status: 'approved' | 'denied' } {
    this.decided.push(input.approvalId);
    if (this.row) {
      this.row = {
        ...this.row,
        status: 'approved',
        decidedBy: input.surface,
        decidedAt: new Date(0).toISOString(),
      };
    }
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

function build(): {
  useCase: DecideApprovalUseCase;
  store: StoreStub;
  rules: MemoryPermissionRules;
  agents: AgentsStub;
  modes: ModesStub;
} {
  const store = new StoreStub();
  const rules = new MemoryPermissionRules();
  const agents = new AgentsStub();
  agents.agent = agentRecord();
  const modes = new ModesStub();
  const fileRules = new StubFileRules();
  const useCase = new DecideApprovalUseCase(
    store,
    new MemoryApprovalEvents(),
    rules,
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
  return { useCase, store, rules, agents, modes };
}

function shellRowsOf(rules: MemoryPermissionRules): PermissionRuleRecord[] {
  return rules.rows.filter(
    (row) => row.kind === 'shell-cmd' && row.agentId === 'agent-1' && row.effect === 'allow',
  );
}

describe('DecideApprovalUseCase rule persistence', () => {
  test('approve with agent rule records a shell command rule', async () => {
    const { useCase, rules, agents, modes } = build();
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
    expect(shellRowsOf(rules).map((row) => row.pattern)).toEqual(['bun *']);
    expect(shellRowsOf(rules)[0]?.decidedBy).toBe('web');
    expect(agents.updates).toHaveLength(0);
    expect(modes.updates).toHaveLength(0);
  });

  test('duplicate pattern is not duplicated', async () => {
    const { useCase, rules } = build();
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve',
        surface: 'web',
        rule: { kind: 'exact', pattern: 'git status', target: 'agent' },
      },
    });
    expect(rules.rows).toHaveLength(1);
  });

  test('floor pattern throws and persists nothing', async () => {
    const { useCase, store, rules, agents, modes } = build();
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
    expect(rules.rows).toHaveLength(0);
    expect(agents.updates).toHaveLength(0);
    expect(modes.updates).toHaveLength(0);
  });

  test('approve_once with a rule persists nothing', async () => {
    const { useCase, rules, agents, modes } = build();
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
    expect(rules.rows).toHaveLength(0);
    expect(agents.updates).toHaveLength(0);
    expect(modes.updates).toHaveLength(0);
  });

  test('deny with a rule persists nothing', async () => {
    const { useCase, rules, agents, modes } = build();
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'deny',
        surface: 'web',
        rule: { kind: 'program', pattern: 'bun *', target: 'agent' },
      },
    });
    expect(rules.rows).toHaveLength(0);
    expect(agents.updates).toHaveLength(0);
    expect(modes.updates).toHaveLength(0);
  });

  test('global rule lands org-wide with a default mode', async () => {
    const { useCase, rules, agents, modes } = build();
    agents.agent = agents.agent ? { ...agents.agent, defaultModeId: 'plan' } : agents.agent;
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
    expect(rules.rows.map((row) => row.agentId)).toEqual([null]);
    expect(modes.updates).toHaveLength(0);
    expect(agents.updates).toHaveLength(0);
  });

  test('global rule falls back to the agent without a default mode', async () => {
    const { useCase, rules, agents, modes } = build();
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: {
        decision: 'approve',
        surface: 'web',
        rule: { kind: 'program', pattern: 'bun *', target: 'global' },
      },
    });
    expect(rules.rows.map((row) => row.agentId)).toEqual(['agent-1']);
    expect(modes.updates).toHaveLength(0);
    expect(agents.updates).toHaveLength(0);
  });
});

describe('DecideApprovalUseCase operation persistence', () => {
  function withOps(store: StoreStub): void {
    if (store.row) {
      store.row = { ...store.row, context: { source: 'permission', ops: ['network'] } };
    }
  }

  test('approve with always scope records the operation rule', async () => {
    const { useCase, store, rules, agents } = build();
    withOps(store);
    const result = await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: { decision: 'approve', surface: 'web', scope: 'always' },
    });
    expect(result.winner).toBe(true);
    expect(rules.hasOperation('org-1', 'agent-1', 'network')).toBe(true);
    expect(rules.rows[0]?.decidedBy).toBe('web');
    expect(agents.updates).toHaveLength(0);
  });

  test('approve without scope stays ephemeral', async () => {
    const { useCase, store, rules } = build();
    withOps(store);
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: { decision: 'approve', surface: 'web' },
    });
    expect(rules.rows).toHaveLength(0);
  });

  test('run scope keeps the gate ephemeral', async () => {
    const { useCase, store, rules } = build();
    withOps(store);
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: { decision: 'approve', surface: 'web', scope: 'run' },
    });
    expect(rules.rows).toHaveLength(0);
  });

  test('approve_once never persists', async () => {
    const { useCase, store, rules } = build();
    withOps(store);
    await useCase.execute({
      orgId: 'org-1',
      approvalId: 'approval-1',
      body: { decision: 'approve_once', surface: 'web' },
    });
    expect(rules.rows).toHaveLength(0);
  });
});
