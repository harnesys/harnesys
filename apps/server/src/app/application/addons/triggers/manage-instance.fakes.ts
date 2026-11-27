import { type TriggerStartParams } from '../../../domain/addons/ports/addon-call.port.ts';
import { AutomationEventsPort } from '../../../domain/automations/automation-events.port.ts';
import { FakeThreadAgents, FakeThreads } from '../../threads/thread.fakes.ts';
import {
  FakeAudit,
  FakeTriggerWorkspace,
  InMemoryCatalog,
  InMemoryOrgAddons,
  InMemoryTriggers,
  NoopCalls,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { buildTriggerScripts } from '../trigger-script.fakes.ts';
import { ManageTriggerInstanceUseCase } from './manage-instance.use-case.ts';

export const ACTOR = { kind: 'user' as const, id: 'admin' };
export const ORG = 'org1';
export const THREAD_ID = '11111111-1111-4111-8111-111111111111';
export const AGENT_ID = '22222222-2222-4222-8222-222222222222';
export const STRANGER_AGENT_ID = '33333333-3333-4333-8333-333333333333';
export const OTHER_THREAD_ID = '44444444-4444-4444-8444-444444444444';
export const TARGET = { threadId: THREAD_ID, agentId: AGENT_ID, modeId: 'plan' };

export class FakeAutomationEvents extends AutomationEventsPort {
  published: Array<{ orgId: string; kind: string; action: string }> = [];
  publish(orgId: string, event: { kind: string; action: 'changed' | 'removed' }): void {
    this.published.push({ orgId, kind: event.kind, action: event.action });
  }
  subscribe(): () => void {
    return () => {};
  }
}

export class RejectingCalls extends NoopCalls {
  reject = true;
  override async triggerStart(
    _orgId: string,
    _addonId: string,
    params: TriggerStartParams,
  ): Promise<void> {
    this.calls.push(`trigger.start:${params.instanceId}`);
    if (this.reject) {
      throw new Error('invalid_params: invalid cron: "nonsense"');
    }
  }
}

export function build(
  enabled = true,
  descriptorExtra?: Record<string, unknown>,
  callsArg?: NoopCalls,
) {
  const { pkg } = testManifest({
    contributions: [
      {
        id: 'feed',
        family: 'trigger',
        descriptor: {
          kind: 'feed',
          title: 'Feed',
          description: '',
          configFields: [],
          ...descriptorExtra,
        },
      },
    ],
  });
  const catalog = new InMemoryCatalog();
  catalog.packages.set(`acme.tool@1.0.0`, pkg);
  const orgAddons = new InMemoryOrgAddons();
  orgAddons.upsert({
    orgId: ORG,
    addonId: 'acme.tool',
    version: '1.0.0',
    enabled,
    grantsJson: '[]',
    grantsDigest: 'd',
    configJson: '{}',
    health: 'stopped',
    lastError: null,
    createdAt: 't0',
    updatedAt: 't0',
  });
  const triggers = new InMemoryTriggers();
  const calls = callsArg ?? new NoopCalls();
  const threads = new FakeThreads();
  const threadAgents = new FakeThreadAgents();
  threads.insert({
    id: THREAD_ID,
    orgId: ORG,
    title: 'Feed thread',
    kind: 'chat',
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: 't0',
    updatedAt: 't0',
    lastReadAt: 't0',
  });
  threadAgents.ensure(ORG, THREAD_ID, AGENT_ID);
  const useCase = new ManageTriggerInstanceUseCase(
    orgAddons,
    catalog,
    triggers,
    calls,
    new FakeAudit(),
    threads,
    threadAgents,
    new FakeAutomationEvents(),
    new FakeTriggerWorkspace(),
    buildTriggerScripts(triggers).runs,
    new NullLogger(),
  );
  return { useCase, triggers, calls, threads, threadAgents };
}
