import { Injectable, Logger, type ModuleDestroyHook } from '@harnesys/brix';
import type { AcceptedRunResponse, CancelRunResponse, RetryRunResponse } from '@harnesys/contracts';
import { and, count, eq, isNotNull } from 'drizzle-orm';
import type {
  HostEngineEntry,
  McpServerInfo,
  RunEventStore,
  RunLifecycleStore,
  SessionEvent,
  SessionHandle,
  TruncateThreadResult,
} from 'harnesys';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HookRunStorePort } from '../../domain/agent/hook-run-store.port.ts';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { BrowserHostPort } from '../../domain/browser/browser-host.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { KnowledgeSearchPort } from '../../domain/knowledge/knowledge-search.port.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMcpPort } from '../../domain/mcp/org-mcp.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { PlanEventsPort } from '../../domain/plan/plan-events.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import {
  type CompactThreadResult,
  LocalExecutorPort,
  type SendLocalRunInput,
  type ThreadQueueDrainResult,
} from '../../domain/thread/local-executor.port.ts';
import { RunNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WaitTickerGatePort } from '../../domain/thread/wait-ticker-gate.port.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { runsTable } from '../org-sqlite/schema/index.ts';
import { openOrgRuntime } from './org-runtime.ts';
import type { OrgRuntime } from './org-runtime.types.ts';
import { githubToolsDeps } from './packs/github-tools.holder.ts';
import { googleToolsDeps } from './packs/google-tools.holder.ts';
import { issueToolsDeps } from './packs/issue-tools.holder.ts';
import { managerToolsDeps } from './packs/manager-tools.holder.ts';
import { OrgMcpManagePort } from './packs/org-mcp-manage.port.ts';
import { skillsToolsDeps } from './packs/skills-tools.holder.ts';

@Injectable()
export class LocalExecutorAdapter extends LocalExecutorPort implements ModuleDestroyHook {
  private readonly runtimes = new Map<string, Promise<OrgRuntime>>();

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly modes: ModePresetRegistryPort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly plugins: PluginRuntimePort,
    private readonly sourceSkills: SourceSkillsPort,
    private readonly orgSettings: OrgSettingsPort,
    private readonly approvals: ApprovalStorePort,
    private readonly approvalEvents: ApprovalEventsPort,
    private readonly planEvents: PlanEventsPort,
    private readonly threadEvents: ThreadEventsPort,
    private readonly deskEvents: DeskEventsPort,
    private readonly schedules: ScheduleRepositoryPort,
    private readonly webhooks: WebhookRepositoryPort,
    private readonly knowledgeSearch: KnowledgeSearchPort,
    private readonly knowledgeStore: KnowledgeStorePort,
    private readonly waitGate: WaitTickerGatePort,
    private readonly issueExecutions: IssueExecutionPort,
    private readonly containers: WorkspaceContainerPort,
    private readonly nodes: NodeRepository,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly hookRuns: HookRunStorePort,
    private readonly sourceDriver: SourceDriverPort,
    private readonly fileRules: FileAccessRulePort,
    private readonly mcpConfig: OrgMcpPort,
    private readonly claims: EventClaimPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly log: Logger,
    private readonly browserHost?: BrowserHostPort,
    private readonly lsp?: LspPort,
  ) {
    super();
  }

  onModuleDestroy(): void {
    for (const pending of this.runtimes.values()) {
      void pending.then((rt) => rt.close()).catch(() => {});
    }
    this.runtimes.clear();
  }

  private browserEnginesDeps(): { snapshot: () => Promise<HostEngineEntry[]> } | undefined {
    const host = this.browserHost;
    return host !== undefined ? { snapshot: () => host.snapshot() } : undefined;
  }

  private ensure(orgId: string): Promise<OrgRuntime> {
    const cached = this.runtimes.get(orgId);
    if (cached) {
      return cached;
    }
    const issues = issueToolsDeps();
    const manager = managerToolsDeps();
    const skills = skillsToolsDeps();
    const google = googleToolsDeps();
    const github = githubToolsDeps();
    const pending = openOrgRuntime({
      orgId,
      logger: this.log.child('org-runtime'),
      layout: this.layout,
      machineConfig: this.machineConfig,
      containers: this.containers,
      nodes: this.nodes,
      threads: this.threads,
      agents: this.agents,
      hookRuns: this.hookRuns,
      modes: this.modes,
      sources: this.sources,
      sourceLocation: this.sourceLocation,
      materializations: this.materializations,
      worktrees: this.worktrees,
      sourceDriver: this.sourceDriver,
      providers: this.providers,
      models: this.models,
      secrets: this.secrets,
      fileRules: this.fileRules,
      plugins: this.plugins,
      sourceSkills: this.sourceSkills,
      orgSettings: this.orgSettings,
      mcpManage: new OrgMcpManagePort({
        orgId,
        config: this.mcpConfig,
        listLive: () => this.listMcpServers(orgId),
        invalidateBundle: () => this.plugins.invalidate(orgId),
        apply: async (serverId, entry) => {
          const runtime = await this.ensure(orgId);
          await runtime.reloadMcp(serverId, entry);
        },
      }),
      ...(this.browserEnginesDeps() !== undefined
        ? { browserEngines: this.browserEnginesDeps() }
        : {}),
      approvals: this.approvals,
      approvalEvents: this.approvalEvents,
      claims: this.claims,
      commands: this.commands,
      planEvents: this.planEvents,
      threadEvents: this.threadEvents,
      deskEvents: this.deskEvents,
      schedules: this.schedules,
      webhooks: this.webhooks,
      knowledge: {
        search: this.knowledgeSearch,
        store: this.knowledgeStore,
        sources: this.sources,
      },
      waitGate: this.waitGate,
      issueExecutions: this.issueExecutions,
      ...(issues ? { issues } : {}),
      ...(manager ? { manager } : {}),
      ...(google ? { google } : {}),
      ...(github ? { github } : {}),
      ...(skills ? { skills } : {}),
      ...(this.lsp ? { lsp: this.lsp } : {}),
    });
    this.runtimes.set(orgId, pending);
    pending.catch(() => {
      if (this.runtimes.get(orgId) === pending) {
        this.runtimes.delete(orgId);
      }
    });
    return pending;
  }

  async lifecycle(orgId: string): Promise<RunLifecycleStore> {
    return (await this.ensure(orgId)).lifecycle;
  }

  async events(orgId: string): Promise<RunEventStore> {
    return (await this.ensure(orgId)).events;
  }

  async sessionFor(orgId: string, threadId: string): Promise<SessionHandle> {
    return (await this.ensure(orgId)).sessionFor(threadId);
  }

  async send(input: SendLocalRunInput): Promise<AcceptedRunResponse> {
    const rt = await this.ensure(input.orgId);
    return rt.send({
      threadId: input.threadId,
      text: input.text,
      effort: input.effort,
      attachments: input.attachments,
      ...(input.skills?.length ? { skills: input.skills } : {}),
      clientEventId: input.clientEventId,
      ...(input.origin ? { origin: input.origin } : {}),
      correlationId: input.correlationId,
      ...(input.directory ? { directory: input.directory } : {}),
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
      ...(input.isolation ? { isolation: input.isolation } : {}),
      ...(input.triggerKind ? { triggerKind: input.triggerKind } : {}),
      ...(input.branch ? { branch: input.branch } : {}),
      ...(input.attribution ? { attribution: input.attribution } : {}),
    });
  }

  async compact(orgId: string, threadId: string): Promise<CompactThreadResult> {
    return (await this.ensure(orgId)).compact(threadId);
  }

  async drainMessageQueue(orgId: string, threadId: string): Promise<ThreadQueueDrainResult> {
    return (await this.ensure(orgId)).drainMessageQueue(threadId);
  }

  async cancel(orgId: string, runId: string): Promise<CancelRunResponse> {
    const rt = await this.ensure(orgId);
    const rec = await rt.lifecycle.get(runId);
    if (!rec) {
      throw new RunNotFoundException(runId);
    }
    await rt.cancel(runId);
    return { ok: true };
  }

  async retry(orgId: string, runId: string): Promise<RetryRunResponse> {
    const rt = await this.ensure(orgId);
    const rec = await rt.lifecycle.get(runId);
    if (!rec) {
      throw new RunNotFoundException(runId);
    }
    return rt.retry(runId);
  }

  async truncateThreadFrom(
    orgId: string,
    threadId: string,
    runId: string,
    seq: number,
  ): Promise<TruncateThreadResult> {
    return (await this.ensure(orgId)).truncateThread(threadId, runId, seq);
  }

  async removeThreadEvent(
    orgId: string,
    threadId: string,
    runId: string,
    seq: number,
  ): Promise<SessionEvent> {
    return (await this.ensure(orgId)).removeThreadEvent(threadId, runId, seq);
  }

  async tickWaitTimers(orgId: string): Promise<number> {
    const rt = await this.ensure(orgId);
    return rt.tickWaitTimers();
  }

  async countWaitingTimers(orgId: string): Promise<number> {
    const row = await withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ value: count() })
        .from(runsTable)
        .where(and(eq(runsTable.status, 'waiting'), isNotNull(runsTable.waitFireAt)))
        .get(),
    );
    return row?.value ?? 0;
  }

  async stream(
    orgId: string,
    runId: string,
    fromSeq?: number,
  ): Promise<AsyncIterable<SessionEvent>> {
    const rt = await this.ensure(orgId);
    const rec = await rt.lifecycle.get(runId);
    if (!rec && !(await rt.events.hasRun(runId))) {
      throw new RunNotFoundException(runId);
    }
    return rt.stream(runId, fromSeq ?? 0);
  }

  async publishEvents(orgId: string, runId: string, events: SessionEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const rt = await this.ensure(orgId);
    rt.feed.publish(runId, events);
  }

  async listMcpServers(orgId: string): Promise<McpServerInfo[]> {
    return (await this.ensure(orgId)).listMcpServers();
  }

  async invalidateRuntime(orgId: string): Promise<void> {
    const pending = this.runtimes.get(orgId);
    if (!pending) {
      return;
    }
    this.runtimes.delete(orgId);
    try {
      const rt = await pending;
      rt.closeWhenIdle();
    } catch {
      // runtime may have failed to open; dropping the cache entry is enough
    }
  }
}
