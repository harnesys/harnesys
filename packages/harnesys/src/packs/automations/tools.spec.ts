import { describe, expect, test } from 'bun:test';
import type { TriggerScriptRunList, TriggerScriptTestResponse } from '@harnesys/contracts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  AutomationCreateInput,
  AutomationInstance,
  AutomationTriggerKind,
  AutomationUpdateInput,
} from '../../ports/automation-admin.ts';
import { AutomationAdminPort } from '../../ports/automation-admin.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { automationsCapability } from './index.ts';
import { createAutomationTools } from './tools.ts';

const ctx = {} as ToolContext;

function scope(): CapabilityScope {
  return { orgId: 'org-1', agentId: 'agent-1', sourceIds: [], threadId: 'thread-1' };
}

class FakeAutomations extends AutomationAdminPort {
  readonly created: AutomationCreateInput[] = [];
  readonly updated: AutomationUpdateInput[] = [];
  readonly removed: string[] = [];
  readonly actions: Array<{ instanceId: string; action: string; input?: Record<string, unknown> }> =
    [];

  override listKinds(): AutomationTriggerKind[] {
    return [
      { addonId: 'acme.one', addonTitle: 'One', kind: 'one.feed', title: 'Feed' },
      { addonId: 'acme.two', addonTitle: 'Two', kind: 'two.feed', title: 'Feed' },
    ];
  }

  override list(): AutomationInstance[] {
    return [];
  }

  override get(): AutomationInstance | null {
    return null;
  }

  override async create(_orgId: string, input: AutomationCreateInput): Promise<AutomationInstance> {
    this.created.push(input);
    return instanceOf(input);
  }

  override async update(_orgId: string, input: AutomationUpdateInput): Promise<AutomationInstance> {
    this.updated.push(input);
    return instanceOf({
      addonId: 'acme.one',
      kind: 'one.feed',
      label: input.label ?? 'Feed',
      target: input.target ?? {},
    });
  }

  override async setEnabled(): Promise<void> {}

  override async remove(_orgId: string, instanceId: string): Promise<void> {
    this.removed.push(instanceId);
  }

  override async action(
    _orgId: string,
    instanceId: string,
    action: string,
    input?: Record<string, unknown>,
  ): Promise<unknown> {
    this.actions.push({ instanceId, action, ...(input === undefined ? {} : { input }) });
    return { ok: true };
  }

  override scriptRuns(): TriggerScriptRunList {
    return { items: [] };
  }

  override async testScript(): Promise<TriggerScriptTestResponse> {
    return {
      status: 'ok',
      exitCode: 0,
      durationMs: 1,
      cwd: '/tmp',
      gateVerdict: 'not-applied',
      stdout: '',
      stderr: '',
    };
  }
}

function instanceOf(input: AutomationCreateInput): AutomationInstance {
  return {
    instanceId: 'ti-1',
    addonId: input.addonId,
    kind: input.kind,
    label: input.label,
    enabled: input.enabled ?? true,
    instructions: input.instructions ?? '',
    config: input.config ?? {},
    target: input.target,
    createdAt: '',
    updatedAt: '',
  };
}

function toolsOf(port: AutomationAdminPort): Map<string, ToolDefinition> {
  return new Map(
    createAutomationTools({ automations: port, resolveScope: scope }).map((entry) => [
      entry.name,
      entry,
    ]),
  );
}

describe('automations pack tools', () => {
  test('declared meta tools match the created tools', () => {
    const created = createAutomationTools({
      automations: new FakeAutomations(),
      resolveScope: scope,
    }).map((entry) => entry.name);
    expect(automationsCapability.meta.tools.map((entry) => entry.name)).toEqual(created);
  });

  test('create defaults to the calling thread and agent and acknowledges scripts', async () => {
    const port = new FakeAutomations();
    const create = toolsOf(port).get('automation_create');
    await create?.execute(
      {
        addonId: 'acme.one',
        kind: 'one.feed',
        label: 'Feed',
        config: { query: 'x' },
        scripts: { pre: { script: { command: 'check.sh' } } },
      },
      ctx,
    );
    expect(port.created[0]?.target).toEqual({
      threadId: 'thread-1',
      agentId: 'agent-1',
      scripts: { pre: { script: { command: 'check.sh' } }, acknowledged: true },
    });
    expect(port.created[0]?.config).toEqual({ query: 'x' });
  });

  test('update with scripts alone sends only the scripts target patch', async () => {
    const port = new FakeAutomations();
    const update = toolsOf(port).get('automation_update');
    await update?.execute(
      { instanceId: 'ti-1', scripts: { post: { script: { command: 'report.sh' } } } },
      ctx,
    );
    expect(port.updated[0]?.target).toEqual({
      scripts: { post: { script: { command: 'report.sh' } }, acknowledged: true },
    });
  });

  test('action forwards the id and input to the add-on', async () => {
    const port = new FakeAutomations();
    const action = toolsOf(port).get('automation_action');
    const out = (await action?.execute(
      { instanceId: 'ti-1', action: 'deliveries', input: { limit: 5 } },
      ctx,
    )) as { action: string; result: unknown };
    expect(port.actions).toEqual([
      { instanceId: 'ti-1', action: 'deliveries', input: { limit: 5 } },
    ]);
    expect(out).toEqual({ action: 'deliveries', result: { ok: true } });
  });

  test('kind list filters by addonId', async () => {
    const list = toolsOf(new FakeAutomations()).get('automation_kind_list');
    const out = (await list?.execute({ addonId: 'acme.two' }, ctx)) as {
      items: AutomationTriggerKind[];
    };
    expect(out.items.map((entry) => entry.kind)).toEqual(['two.feed']);
  });

  test('delete requires confirm', async () => {
    const port = new FakeAutomations();
    const remove = toolsOf(port).get('automation_delete');
    const out = (await remove?.execute({ instanceId: 'ti-1', confirm: false }, ctx)) as {
      error?: string;
    };
    expect(out.error).toContain('confirm=true');
    expect(port.removed).toEqual([]);
  });
});
