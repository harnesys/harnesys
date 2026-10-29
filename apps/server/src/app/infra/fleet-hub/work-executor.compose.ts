import type { Logger } from '@harnesys/brix';
import type { OrgNodeIdentity, TaskEnvelope, TaskEnvelopeAttachment } from '@harnesys/contracts';
import {
  type AgentDefinition,
  type Attachment,
  type CreateRuntimeOptions,
  type IssueTrackerPort,
  type ModelsPort,
  type RuntimeHandle,
  type SessionEvent,
} from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import {
  mergeShellAssignment,
  rawShellAssignment,
} from '../../domain/mode-presets/preset-shell-merge.ts';
import type { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import type { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import type { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import type { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import type { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import type { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import type { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import type { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { toAgentDefinition } from '../runtime/agent-definition.mapper.ts';
import { composeRunSkills } from '../runtime/compose-run-skills.ts';
import { type OrgPluginRuntimeSource, type OrgPluginWiring } from '../runtime/org-plugin-wiring.ts';
import { agentCatalogCreate } from '../runtime/packs/agent-catalog-create.ts';
import type { OrgKnowledgeDeps } from '../runtime/packs/org-knowledge.port.ts';
import type { WireOrgPacksDeps } from '../runtime/packs/wire-org-packs.ts';
import type { prepareWorkerTarget } from './work-executor.util.ts';

export type CreatePlacedRuntime = (
  options: CreateRuntimeOptions,
) => Promise<Pick<RuntimeHandle, 'close' | 'session'>>;

export interface WorkExecutorDeps {
  agents: AgentRegistryPort;
  providers: LlmProviderPort;
  models: LlmModelPort;
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
  containers: WorkspaceContainerPort;
  logger: Logger;
  fileRules?: FileAccessRulePort;
  threads?: ThreadRepositoryPort;
  schedules?: ScheduleRepositoryPort;
  webhooks?: WebhookRepositoryPort;
  knowledge?: OrgKnowledgeDeps;
  fetchImpl?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
  modelsPort?: ModelsPort;
  createRuntimeImpl?: CreatePlacedRuntime;
  plugins?: OrgPluginRuntimeSource;
  sourceSkills?: SourceSkillsPort;
  orgSettings?: OrgSettingsPort;
  issueTracker?: IssueTrackerPort;
}

export interface PlaceRunInput {
  identity: OrgNodeIdentity;
  envelope: TaskEnvelope;
  sendFrame: (payload: string) => void;
  persistEvents?: (events: SessionEvent[]) => void;
  fetchAttachments?: (metas: TaskEnvelopeAttachment[]) => Promise<Attachment[]>;
}

export type PlacedAskResume =
  | {
      action: 'respond';
      askId: string;
      payload: unknown;
      clientEventId?: string;
    }
  | {
      action: 'reject';
      askId: string;
      note?: string;
      clientEventId?: string;
    };

export interface PlaceRunHandle {
  cancel(): void;
  resumeAsk(resume: PlacedAskResume): Promise<void>;
}

export function placedWireDeps(
  deps: WorkExecutorDeps,
  orgId: string,
  db: OrgSqliteDb,
): WireOrgPacksDeps {
  return {
    orgId,
    agents: deps.agents,
    providers: deps.providers,
    models: deps.models,
    sources: deps.sources,
    planDb: db,
    memoryDb: db,
    createAgent: agentCatalogCreate({
      orgId,
      agents: deps.agents,
      providers: deps.providers,
      models: deps.models,
    }),
    ...(deps.threads ? { threads: deps.threads } : {}),
    ...(deps.schedules ? { schedules: deps.schedules } : {}),
    ...(deps.orgSettings ? { orgSettings: deps.orgSettings } : {}),
    ...(deps.webhooks ? { webhooks: deps.webhooks } : {}),
    ...(deps.knowledge ? { knowledge: deps.knowledge } : {}),
    ...(deps.plugins ? { plugins: deps.plugins } : {}),
    ...(deps.issueTracker ? { issueTracker: deps.issueTracker } : {}),
  };
}

export function placedAgentsResolve(deps: WorkExecutorDeps, orgId: string) {
  return {
    resolve: (id: string) => {
      const row = deps.agents.findById(orgId, id);
      return row ? agentDefinitionOf(deps, orgId, row) : undefined;
    },
    list: () =>
      deps.agents.list(orgId).map((row) => ({
        id: row.id,
        name: row.name,
        parentId: row.parentId,
      })),
  };
}

export function agentDefinitionOf(deps: WorkExecutorDeps, orgId: string, row: AgentRecord) {
  const model = row.modelId ? deps.models.findById(orgId, row.modelId) : undefined;
  const provider = model ? deps.providers.findById(orgId, model.providerId) : undefined;
  return toAgentDefinition(row, { model, provider });
}

export function applyEnvelopeShellSpec(
  agentDef: AgentDefinition,
  agent: AgentRecord,
  envelope: TaskEnvelope,
): void {
  if (envelope.modeShellSpec === undefined || !agentDef.packs) {
    return;
  }
  const rawAgent = rawShellAssignment(agent.config);
  if (rawAgent === false) {
    return;
  }
  (agentDef.packs as Record<string, unknown>).shell = mergeShellAssignment(
    rawAgent,
    envelope.modeShellSpec,
  );
}

export async function runSkillsOf(
  deps: WorkExecutorDeps,
  plugin: OrgPluginWiring | undefined,
  orgId: string,
  prepared: ReturnType<typeof prepareWorkerTarget>,
) {
  let skills = plugin?.skills;
  if (plugin !== undefined && deps.sourceSkills !== undefined && deps.orgSettings !== undefined) {
    skills = await composeRunSkills({
      orgSkills: plugin.skills,
      discovery: deps.sourceSkills,
      sources: prepared.sourceRefs,
      autoLoad: deps.orgSettings.get(orgId).skillsSourceAutoLoad,
    });
  }
  return skills;
}
