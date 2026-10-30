import type {
  AgentCatalogCreateInput,
  CapabilityScope,
  HostEngineEntry,
  IssueTrackerPort,
  McpManagePort,
  PackRegistration,
  ProcessJobRegistry,
} from 'harnesys';
import { createProcessJobRegistry } from 'harnesys';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import type { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { DeskEventsPort } from '../../../domain/desk/desk-events.port.ts';
import type { LspPort } from '../../../domain/lsp/lsp.port.ts';
import type { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import type { ModePresetRegistryPort } from '../../../domain/mode-presets/mode-preset-registry.port.ts';
import type { PlanEventsPort } from '../../../domain/plan/plan-events.port.ts';
import type { LlmModelPort, LlmProviderPort } from '../../../domain/provider/llm-provider.port.ts';
import type { ScheduleRepositoryPort } from '../../../domain/schedule/schedule-repository.port.ts';
import type { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import type { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';
import type { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import type { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';
import type { WebhookRepositoryPort } from '../../../domain/webhook/webhook-repository.port.ts';
import { ExecutionProfileAdapter } from '../../execution-profile/execution-profile.adapter.ts';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { requireHostToolScope } from '../host-tool-scope.ts';
import type { OrgPluginRuntimeSource } from '../org-plugin-wiring.ts';
import type { OrgRuntimeDeps } from '../org-runtime.types.ts';
import { agentCatalogCreate } from './agent-catalog-create.ts';
import { OrgAgentsCatalogPort } from './org-agents-catalog.port.ts';
import type { OrgGithubDeps } from './org-github.port.ts';
import type { OrgGoogleDeps } from './org-google.port.ts';
import type { OrgIssueDeps } from './org-issue.port.ts';
import type { OrgKnowledgeDeps } from './org-knowledge.port.ts';
import type { OrgManagerDeps } from './org-manager.port.ts';
import { orgPackNames } from './org-pack-list.ts';
import { registrationForPack } from './org-pack-registrations.ts';
import { isPackSatisfied } from './org-pack-requirements.ts';
import type { OrgSkillsDeps } from './org-skills.pack.port.ts';

export interface WireOrgPacksDeps {
  orgId: string;
  layout?: HostFsLayoutPort;
  agents: AgentRegistryPort;
  providers: LlmProviderPort;
  models: LlmModelPort;
  secrets?: SecretStorePort;
  threads?: ThreadRepositoryPort;
  schedules?: ScheduleRepositoryPort;
  webhooks?: WebhookRepositoryPort;
  deskEvents?: DeskEventsPort;
  issues?: OrgIssueDeps;
  issueTracker?: IssueTrackerPort;
  manager?: OrgManagerDeps;
  google?: OrgGoogleDeps;
  github?: OrgGithubDeps;
  knowledge?: OrgKnowledgeDeps;
  sources?: SourceRegistryPort;
  planDb?: OrgSqliteDb;
  planEvents?: PlanEventsPort;
  memoryDb?: OrgSqliteDb;
  lsp?: LspPort;
  jobs?: ProcessJobRegistry;
  skills?: OrgSkillsDeps;
  orgSettings?: OrgSettingsPort;
  mcpManage?: McpManagePort;
  modes?: ModePresetRegistryPort;
  createAgent?: (input: AgentCatalogCreateInput, scope: CapabilityScope) => Promise<AgentRecord>;
  plugins?: OrgPluginRuntimeSource;
  engineSnapshot?: HostEngineEntry[];
}

export interface WireOrgPackFilter {
  threads?: ThreadRepositoryPort;
  lsp?: LspPort;
  schedules?: ScheduleRepositoryPort;
  webhooks?: WebhookRepositoryPort;
  deskEvents?: DeskEventsPort;
  issues?: OrgIssueDeps;
  issueTracker?: IssueTrackerPort;
  manager?: OrgManagerDeps;
  google?: OrgGoogleDeps;
  github?: OrgGithubDeps;
  knowledge?: OrgKnowledgeDeps;
  skills?: OrgSkillsDeps;
  orgSettings?: OrgSettingsPort;
  mcpManage?: McpManagePort;
  sources?: SourceRegistryPort;
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
): WireOrgPacksDeps {
  return {
    orgId: deps.orgId,
    ...(engineSnapshot !== undefined ? { engineSnapshot } : {}),
    layout: deps.layout,
    agents: deps.agents,
    threads: deps.threads,
    providers: deps.providers,
    models: deps.models,
    sources: deps.sources,
    planDb: db,
    planEvents: deps.planEvents,
    memoryDb: db,
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
    ...(deps.schedules ? { schedules: deps.schedules } : {}),
    ...(deps.webhooks ? { webhooks: deps.webhooks } : {}),
    ...(deps.deskEvents ? { deskEvents: deps.deskEvents } : {}),
    ...(deps.secrets ? { secrets: deps.secrets } : {}),
    ...(deps.knowledge ? { knowledge: deps.knowledge } : {}),
    ...(deps.issues ? { issues: deps.issues } : {}),
    ...(deps.manager ? { manager: deps.manager } : {}),
    ...(deps.google ? { google: deps.google } : {}),
    ...(deps.github ? { github: deps.github } : {}),
    ...(deps.skills ? { skills: deps.skills } : {}),
    ...(deps.lsp ? { lsp: deps.lsp } : {}),
  };
}

export function wireOrgPacks(deps: WireOrgPacksDeps): WiredOrgPacks {
  const jobs = deps.jobs ?? createProcessJobRegistry();
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

  return { registrations, jobs };
}

export function wireOrgPackNames(deps: WireOrgPackFilter): string[] {
  return orgPackNames().filter((packName) => isPackSatisfied(packName, deps));
}
