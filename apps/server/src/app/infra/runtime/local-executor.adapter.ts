import { Injectable, Logger, type ModuleDestroyHook } from '@harnesys/brix';
import type { CancelRunResponse, RetryRunResponse, RunAcceptedResponse } from '@harnesys/contracts';
import type {
  McpServerInfo,
  RunEventStore,
  RunLifecycleStore,
  SessionEvent,
  SessionHandle,
  TruncateThreadResult,
} from 'harnesys';
import { AutomationAdminPort } from 'harnesys';
import { RecordBrowserLoginResultUseCase } from '../../application/browser-login/record-browser-login-result.use-case.ts';
import { resolveMcpVaultEntry } from '../../application/mcp/resolve-mcp-vault-placeholders.ts';
import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HookRunStorePort } from '../../domain/agent/hook-run-store.port.ts';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { BrowserHostPort } from '../../domain/browser/browser-host.port.ts';
import { CredentialResolvePort } from '../../domain/browser/credential-resolve.port.ts';
import { EgressProxyPort } from '../../domain/browser/egress-proxy.port.ts';
import { BrowserLoginAttemptPort } from '../../domain/browser/login-attempt.port.ts';
import { PackRegistryPort } from '../../domain/capabilities/pack-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { KnowledgeSearchPort } from '../../domain/knowledge/knowledge-search.port.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMcpPort } from '../../domain/mcp/org-mcp.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { ModelQuotaFactoryPort } from '../../domain/model-quota/model-quota-factory.port.ts';
import { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';
import { PlanEventsPort } from '../../domain/plan/plan-events.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';
import {
  type CompactThreadResult,
  LocalExecutorPort,
  type SendLocalRunInput,
  type ThreadQueueDrainResult,
} from '../../domain/thread/local-executor.port.ts';
import { RunNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WaitTickerGatePort } from '../../domain/thread/wait-ticker-gate.port.ts';
import { browserLoginDepsOf, engineSnapshotDepsOf } from './browser-login-runtime.deps.ts';
import { openOrgRuntime } from './org-runtime.ts';
import type { OrgRuntime } from './org-runtime.types.ts';
import {
  cachedRuntimeOf,
  drainRuntimes,
  type OrgRuntimeCache,
  releaseRuntime,
  storeRuntime,
} from './org-runtime-cache.ts';
import { OrgMcpManagePort } from './packs/org-mcp-manage.port.ts';
import { packToolsDeps } from './packs/pack-tools-deps.ts';
import { countWaitingTimersOf } from './waiting-timers.count.ts';

@Injectable()
export class LocalExecutorAdapter extends LocalExecutorPort implements ModuleDestroyHook {
  private readonly runtimes: OrgRuntimeCache = new Map();

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly modes: ModePresetRegistryPort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly plugins: PluginRuntimePort,
    private readonly packRegistry: PackRegistryPort,
    private readonly sourceSkills: SourceSkillsPort,
    private readonly orgSettings: OrgSettingsPort,
    private readonly approvals: ApprovalStorePort,
    private readonly approvalEvents: ApprovalEventsPort,
    private readonly permissionRules: PermissionRuleStorePort,
    private readonly planEvents: PlanEventsPort,
    private readonly threadEvents: ThreadEventsPort,
    private readonly deskEvents: DeskEventsPort,
    private readonly terminalSessions: TerminalSessionsPort,
    private readonly triggerInstances: TriggerInstanceRepositoryPort,
    private readonly automations: AutomationAdminPort,
    private readonly knowledgeSearch: KnowledgeSearchPort,
    private readonly knowledgeStore: KnowledgeStorePort,
    private readonly waitGate: WaitTickerGatePort,
    private readonly issueExecutions: IssueExecutionPort,
    private readonly issueEvents: IssueEventsPort,
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
    private readonly modelQuotaFactory?: ModelQuotaFactoryPort,
    private readonly browserResolve?: CredentialResolvePort,
    private readonly browserEgress?: EgressProxyPort,
    private readonly browserAttempts?: BrowserLoginAttemptPort,
    private readonly browserAudit?: OrgAudit,
    private readonly recordLoginResult?: RecordBrowserLoginResultUseCase,
  ) {
    super();
  }

  onModuleDestroy(): void {
    drainRuntimes(this.runtimes);
  }

  private ensure(orgId: string): Promise<OrgRuntime> {
    const revision = this.packRegistry.revision();
    const cached = cachedRuntimeOf(this.runtimes, orgId, revision);
    if (cached !== undefined) {
      return cached;
    }
    const browserLogin = browserLoginDepsOf({
      resolve: this.browserResolve,
      egress: this.browserEgress,
      attempts: this.browserAttempts,
      audit: this.browserAudit,
      recordLoginResult: this.recordLoginResult,
    });
    const engineSnapshotDeps = engineSnapshotDepsOf(this.browserHost);
    const vaultLookup = (key: string) => this.secrets.get(orgId, key);
    const pending = openOrgRuntime({
      orgId,
      logger: this.log.child('org-runtime'),
      layout: this.layout,
      machineConfig: this.machineConfig,
      ...(this.modelQuotaFactory ? { modelQuotaFactory: this.modelQuotaFactory } : {}),
      containers: this.containers,
      nodes: this.nodes,
      threads: this.threads,
      threadAgents: this.threadAgents,
      participants: this.participants,
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
      permissionRules: this.permissionRules,
      plugins: this.plugins,
      packRegistry: this.packRegistry,
      sourceSkills: this.sourceSkills,
      orgSettings: this.orgSettings,
      mcpManage: new OrgMcpManagePort({
        orgId,
        config: this.mcpConfig,
        listLive: () => this.listMcpServers(orgId),
        invalidateBundle: () => this.plugins.invalidate(orgId),
        vaultLookup,
        apply: async (serverId, entry) => {
          const runtime = await this.ensure(orgId);
          const resolved =
            entry === null
              ? null
              : await resolveMcpVaultEntry(serverId, entry, vaultLookup, (message) =>
                  this.log.warn({}, message),
                );
          await runtime.reloadMcp(serverId, resolved);
        },
      }),
      ...(engineSnapshotDeps !== undefined ? { browserEngines: engineSnapshotDeps } : {}),
      approvals: this.approvals,
      approvalEvents: this.approvalEvents,
      claims: this.claims,
      commands: this.commands,
      planEvents: this.planEvents,
      threadEvents: this.threadEvents,
      deskEvents: this.deskEvents,
      terminalSessions: this.terminalSessions,
      triggerInstances: this.triggerInstances,
      automations: this.automations,
      knowledge: {
        search: this.knowledgeSearch,
        store: this.knowledgeStore,
        sources: this.sources,
      },
      waitGate: this.waitGate,
      issueExecutions: this.issueExecutions,
      issueEvents: this.issueEvents,
      ...packToolsDeps(),
      ...(this.lsp ? { lsp: this.lsp } : {}),
      ...(browserLogin !== undefined ? { browserLogin } : {}),
    });
    storeRuntime(this.runtimes, orgId, pending, revision);
    return pending;
  }

  async lifecycle(orgId: string): Promise<RunLifecycleStore> {
    return (await this.ensure(orgId)).lifecycle;
  }

  async events(orgId: string): Promise<RunEventStore> {
    return (await this.ensure(orgId)).events;
  }

  async sessionFor(orgId: string, threadId: string, agentId: string): Promise<SessionHandle> {
    return (await this.ensure(orgId)).sessionFor(threadId, agentId);
  }

  async send(input: SendLocalRunInput): Promise<RunAcceptedResponse> {
    const rt = await this.ensure(input.orgId);
    return rt.send({
      threadId: input.threadId,
      text: input.text,
      effort: input.effort,
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.quote ? { quote: input.quote } : {}),
      attachments: input.attachments,
      ...(input.skills?.length ? { skills: input.skills } : {}),
      clientEventId: input.clientEventId,
      ...(input.origin ? { origin: input.origin } : {}),
      correlationId: input.correlationId,
      ...(input.environment ? { environment: input.environment } : {}),
      ...(input.isolation ? { isolation: input.isolation } : {}),
      ...(input.branch ? { branch: input.branch } : {}),
      ...(input.attribution ? { attribution: input.attribution } : {}),
      agentId: input.agentId,
      ...(input.triggerThreadSeq !== undefined ? { triggerThreadSeq: input.triggerThreadSeq } : {}),
    });
  }

  async compact(
    orgId: string,
    threadId: string,
    signal?: AbortSignal,
    onRun?: (runId: string) => void,
  ): Promise<CompactThreadResult> {
    return (await this.ensure(orgId)).compact(threadId, signal, onRun);
  }

  cancelCompact = (orgId: string, threadId: string): Promise<boolean> =>
    this.ensure(orgId).then((runtime) => runtime.cancelCompact(threadId));

  undoThreadCompact = (orgId: string, threadId: string): Promise<SessionEvent> =>
    this.ensure(orgId).then((runtime) => runtime.undoThreadCompact(threadId));

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
    threadSeq: number,
  ): Promise<TruncateThreadResult> {
    return (await this.ensure(orgId)).truncateThread(threadId, threadSeq);
  }

  async removeThreadEvent(
    orgId: string,
    threadId: string,
    threadSeq: number,
  ): Promise<SessionEvent> {
    return (await this.ensure(orgId)).removeThreadEvent(threadId, threadSeq);
  }

  async tickWaitTimers(orgId: string): Promise<number> {
    const rt = await this.ensure(orgId);
    return rt.tickWaitTimers();
  }

  async wakeRuns(orgId: string, wakeKey: string, agentId?: string): Promise<number> {
    return (await this.ensure(orgId)).wakeRuns(wakeKey, agentId);
  }

  async countWaitingTimers(orgId: string): Promise<number> {
    return countWaitingTimersOf(this.layout, orgId);
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

  async listMcpServers(orgId: string): Promise<McpServerInfo[]> {
    return (await this.ensure(orgId)).listMcpServers();
  }

  async invalidateRuntime(orgId: string): Promise<void> {
    await releaseRuntime(this.runtimes, orgId);
  }
}
