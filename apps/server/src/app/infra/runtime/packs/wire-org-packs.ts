import type {
  AgentCatalogCreateInput,
  CapabilityScope,
  HostEngineEntry,
  IssueTrackerPort,
  McpManagePort,
  PackRegistration,
  ProcessJobRegistry,
  RunEventStore,
} from 'harnesys';
import { createProcessJobRegistry } from 'harnesys';
import type { OrgDashboardsDeps } from '../../../application/dashboards/dashboard-tools.holder.ts';
import { dashboardsToolsDeps } from '../../../application/dashboards/dashboard-tools.holder.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { PackRegistryPort } from '../../../domain/capabilities/pack-registry.port.ts';
import { DeskEventsPort } from '../../../domain/desk/desk-events.port.ts';
import { LspPort } from '../../../domain/lsp/lsp.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { ModePresetRegistryPort } from '../../../domain/mode-presets/mode-preset-registry.port.ts';
import { PermissionRuleStorePort } from '../../../domain/permissions/permission-rule-store.port.ts';
import { PlanEventsPort } from '../../../domain/plan/plan-events.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../../domain/provider/llm-provider.port.ts';
import { isHostWired, orgPackNames } from '../../../domain/runtime/org-pack-list.ts';
import { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';
import { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import { TerminalSessionsPort } from '../../../domain/terminal/terminal-session.port.ts';
import { ThreadAgentRepositoryPort } from '../../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';
import { ExecutionProfileAdapter } from '../../execution-profile/execution-profile.adapter.ts';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { requireHostToolScope } from '../host-tool-scope.ts';
import type { OrgPluginRuntimeSource } from '../org-plugin-wiring.ts';
import type { OrgRuntimeDeps } from '../org-runtime.types.ts';
import { agentCatalogCreate } from './agent-catalog-create.ts';
import { OrgAgentsCatalogPort } from './org-agents-catalog.port.ts';
import type { OrgIssueDeps } from './org-issue.port.ts';
import type { OrgKnowledgeDeps } from './org-knowledge.port.ts';
import type { OrgManagerDeps } from './org-manager.port.ts';
import { registrationForPack } from './org-pack-registrations.ts';
import { isPackSatisfied } from './org-pack-requirements.ts';
import type { OrgSkillsDeps } from './org-skills.pack.port.ts';
import type { OrgSourcesDeps } from './org-sources.pack.port.ts';
import type { SignalToolsDeps } from './signal-tools.holder.ts';

export interface WireOrgPacksDeps {
  orgId: string;
  layout?: HostFsLayoutPort;
  agents: AgentRegistryPort;
  providers: LlmProviderPort;
  models: LlmModelPort;
  secrets?: SecretStorePort;
  threads?: ThreadRepositoryPort;
  threadAgents?: ThreadAgentRepositoryPort;
  events?: RunEventStore;
  deskEvents?: DeskEventsPort;
  triggerInstances?: TriggerInstanceRepositoryPort;
  issues?: OrgIssueDeps;
  issueTracker?: IssueTrackerPort;
  signals?: SignalToolsDeps;
  manager?: OrgManagerDeps;
  knowledge?: OrgKnowledgeDeps;
  sources?: SourceRegistryPort;
  planDb?: OrgSqliteDb;
  planEvents?: PlanEventsPort;
  memoryDb?: OrgSqliteDb;
  lsp?: LspPort;
  jobs?: ProcessJobRegistry;
  terminalSessions?: TerminalSessionsPort;
  permissionRules?: PermissionRuleStorePort;
  skills?: OrgSkillsDeps;
  orgSettings?: OrgSettingsPort;
  mcpManage?: McpManagePort;
  modes?: ModePresetRegistryPort;
  sourcesPack?: OrgSourcesDeps;
  createAgent?: (input: AgentCatalogCreateInput, scope: CapabilityScope) => Promise<AgentRecord>;
  plugins?: OrgPluginRuntimeSource;
  engineSnapshot?: HostEngineEntry[];
  packRegistry?: PackRegistryPort;
  dashboards?: OrgDashboardsDeps;
}

export interface WireOrgPackFilter {
  threads?: ThreadRepositoryPort;
  threadAgents?: ThreadAgentRepositoryPort;
  lsp?: LspPort;
  deskEvents?: DeskEventsPort;
  issues?: OrgIssueDeps;
  issueTracker?: IssueTrackerPort;
  signals?: SignalToolsDeps;
  manager?: OrgManagerDeps;
  knowledge?: OrgKnowledgeDeps;
  skills?: OrgSkillsDeps;
  orgSettings?: OrgSettingsPort;
  mcpManage?: McpManagePort;
  sources?: SourceRegistryPort;
  sourcesPack?: OrgSourcesDeps;
  planDb?: OrgSqliteDb;
  memoryDb?: OrgSqliteDb;
}

export interface WiredOrgPacks {
  registrations: PackRegistration[];
  jobs: ProcessJobRegistry;
}

export function orgPackInputs(
  deps: OrgRuntimeDeps,
  db: OrgSqliteDb,
  engineSnapshot?: HostEngineEntry[],
  events?: RunEventStore,
): WireOrgPacksDeps {
  const dashboards = dashboardsToolsDeps();
  return {
    orgId: deps.orgId,
    ...(dashboards === undefined ? {} : { dashboards }),
    ...(engineSnapshot !== undefined ? { engineSnapshot } : {}),
    layout: deps.layout,
    agents: deps.agents,
    threads: deps.threads,
    threadAgents: deps.threadAgents,
    ...(events !== undefined ? { events } : {}),
    providers: deps.providers,
    models: deps.models,
    sources: deps.sources,
    planDb: db,
    planEvents: deps.planEvents,
    memoryDb: db,
    ...optionalInputs(deps),
    createAgent: agentCatalogCreate({
      orgId: deps.orgId,
      agents: deps.agents,
      providers: deps.providers,
      models: deps.models,
    }),
    plugins: deps.plugins,
    orgSettings: deps.orgSettings,
    mcpManage: deps.mcpManage,
    modes: deps.modes,
    ...(deps.packRegistry !== undefined ? { packRegistry: deps.packRegistry } : {}),
  };
}

function optionalInputs(deps: OrgRuntimeDeps): Partial<WireOrgPacksDeps> {
  return {
    ...(deps.permissionRules !== undefined ? { permissionRules: deps.permissionRules } : {}),
    ...(deps.terminalSessions !== undefined ? { terminalSessions: deps.terminalSessions } : {}),
    ...(deps.triggerInstances ? { triggerInstances: deps.triggerInstances } : {}),
    ...(deps.deskEvents ? { deskEvents: deps.deskEvents } : {}),
    ...(deps.secrets ? { secrets: deps.secrets } : {}),
    ...(deps.knowledge ? { knowledge: deps.knowledge } : {}),
    ...(deps.issues ? { issues: deps.issues } : {}),
    ...(deps.manager ? { manager: deps.manager } : {}),
    ...(deps.skills ? { skills: deps.skills } : {}),
    ...(deps.sourcesPack ? { sourcesPack: deps.sourcesPack } : {}),
    ...(deps.lsp ? { lsp: deps.lsp } : {}),
  };
}

export function wireOrgPacks(deps: WireOrgPacksDeps): WiredOrgPacks {
  const jobs = deps.jobs ?? deps.terminalSessions?.jobRegistry() ?? createProcessJobRegistry();
  const stubScope = (): CapabilityScope => ({
    orgId: deps.orgId,
    agentId: '_',
    sourceIds: [],
    threadId: '_',
  });
  const liveScope = (): CapabilityScope => {
    const scope = requireHostToolScope();
    const agent = deps.agents.findById(scope.orgId, scope.agentId);
    return {
      ...scope,
      ...(agent?.name ? { agentName: agent.name } : {}),
    };
  };

  const createAgent =
    deps.createAgent ??
    ((input: AgentCatalogCreateInput, scope: CapabilityScope) =>
      Promise.reject(
        new Error(`agents_create unavailable for ${input.name} in org ${scope.orgId}`),
      ));

  const agentsPort = new OrgAgentsCatalogPort({
    orgId: deps.orgId,
    agents: deps.agents,
    providers: deps.providers,
    models: deps.models,
    createAgent,
    ...(deps.plugins !== undefined ? { plugins: deps.plugins } : {}),
    ...(deps.modes !== undefined ? { modes: deps.modes } : {}),
    ...(deps.layout !== undefined ? { profiles: new ExecutionProfileAdapter(deps.layout) } : {}),
  });

  const ctx = {
    deps,
    jobs,
    agentsPort,
    stubScope,
    liveScope,
    lsp: deps.lsp,
    engineSnapshot: deps.engineSnapshot,
  };
  const registrations = orgPackNames().flatMap((packName) => {
    const registration = registrationForPack(packName, ctx);
    return registration ? [registration] : [];
  }) as PackRegistration[];

  return { registrations: mergePackRegistry(registrations, deps.packRegistry), jobs };
}

/**
 * Add-on tool packs are registered dynamically in the shared {@link PackRegistryPort}
 * (`tool-pack` family), not by the host pack list. Merge them into the run-time set so
 * an agent that grants an add-on pack actually receives its tools.
 */
function mergePackRegistry(
  host: PackRegistration[],
  registry: PackRegistryPort | undefined,
): PackRegistration[] {
  if (registry === undefined) {
    return host;
  }
  const addons = registry
    .registrations()
    .filter((registration) => !isHostWired(registration.pack.name));
  return [...host, ...addons];
}

export function wireOrgPackNames(deps: WireOrgPackFilter): string[] {
  return orgPackNames().filter((packName) => isPackSatisfied(packName, deps));
}
