import type {
  AgentSnapshot,
  OrgExecutionSnapshot,
  ProviderSnapshot,
  SourceSnapshot,
} from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type {
  LlmModel,
  LlmModelPort,
  LlmProvider,
  LlmProviderPort,
} from '../../domain/provider/llm-provider.port.ts';
import type { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import {
  type ResolvedSourceLocation,
  type ResolveSourceLocationInput,
  SourceLocationPort,
} from '../../domain/source/source-location.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRecord, SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { resolveContentRoot } from '../content/fs-content-ops.ts';
import { resolveSourceLocation } from '../source/source-location.adapter.ts';

export function agentRecordFromSnapshot(agent: AgentSnapshot): AgentRecord {
  return {
    id: agent.id,
    orgId: agent.orgId,
    name: agent.name,
    role: agent.role,
    instructions: agent.instructions,
    modelId: agent.modelId,
    budgetUsdDaily: agent.budgetUsdDaily,
    level: agent.level,
    parentId: agent.parentId,
    executionProfileId: agent.executionProfileId,
    status: agent.status,
    sharedSourceIds: agent.sharedSourceIds,
    sourceLevels: agent.sourceLevels ?? {},
    secretNames: agent.secretNames,
    skills: agent.skills,
    mcpServers: agent.mcpServers,
    enabledPlugins: agent.enabledPlugins,
    defaultModeId: agent.defaultModeId,
    config: agent.config ?? {},
    hooks: agent.hooks ?? [],
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export function providerFromSnapshot(provider: ProviderSnapshot): LlmProvider {
  return {
    id: provider.id,
    orgId: provider.orgId,
    name: provider.name,
    driver: provider.driver,
    apiUrl: provider.apiUrl,
    apiKey: provider.apiKeyRef,
    headers: provider.headers,
    enabled: provider.enabled,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

export function sourceFromSnapshot(source: SourceSnapshot): SourceRecord {
  return {
    id: source.id,
    orgId: source.orgId,
    name: source.name,
    description: null,
    distribution: source.distribution,
    uiVisibility: source.uiVisibility,
    managed: source.managed,
    vcs: source.vcs,
    availability: source.availability,
    lspJson: null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export function createSnapshotAgentRegistry(snapshot: OrgExecutionSnapshot): AgentRegistryPort {
  const agents = snapshot.agents.map(agentRecordFromSnapshot);
  return {
    list: (orgId) => agents.filter((agent) => agent.orgId === orgId),
    findById: (orgId, id) => agents.find((agent) => agent.orgId === orgId && agent.id === id),
    findByName: (orgId, name) =>
      agents.find((agent) => agent.orgId === orgId && agent.name === name),
    insert: () => {
      throw new Error('org execution replica is read-only');
    },
    update: () => {
      throw new Error('org execution replica is read-only');
    },
    delete: () => {
      throw new Error('org execution replica is read-only');
    },
  } as AgentRegistryPort;
}

export function createSnapshotProviderPort(snapshot: OrgExecutionSnapshot): LlmProviderPort {
  const providers = snapshot.providers.map(providerFromSnapshot);
  return {
    list: (orgId) => providers.filter((provider) => provider.orgId === orgId),
    findById: (orgId, id) =>
      providers.find((provider) => provider.orgId === orgId && provider.id === id),
    findByName: (orgId, name) =>
      providers.find((provider) => provider.orgId === orgId && provider.name === name),
    insert: () => {
      throw new Error('org execution replica is read-only');
    },
    update: () => {
      throw new Error('org execution replica is read-only');
    },
    delete: () => {
      throw new Error('org execution replica is read-only');
    },
  } as LlmProviderPort;
}

export function createSnapshotModelPort(snapshot: OrgExecutionSnapshot): LlmModelPort {
  const models: LlmModel[] = snapshot.models.map((model) => ({
    id: model.id,
    providerId: model.providerId,
    name: model.name,
    kind: model.kind,
    metadata: model.metadata,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  }));
  return {
    listByProvider: (_orgId, providerId) =>
      models.filter((model) => model.providerId === providerId),
    findById: (_orgId, id) => models.find((model) => model.id === id),
    findByProviderAndName: (_orgId, providerId, name) =>
      models.find((model) => model.providerId === providerId && model.name === name),
    insert: () => {
      throw new Error('org execution replica is read-only');
    },
    update: () => {
      throw new Error('org execution replica is read-only');
    },
    delete: () => {
      throw new Error('org execution replica is read-only');
    },
  } as LlmModelPort;
}

export function createSnapshotSourceRegistry(snapshot: OrgExecutionSnapshot): SourceRegistryPort {
  const sources = snapshot.sources.map(sourceFromSnapshot);
  return {
    list: (orgId) => sources.filter((source) => source.orgId === orgId),
    findById: (orgId, sourceId) =>
      sources.find((source) => source.orgId === orgId && source.id === sourceId) ?? null,
    findManagedWorkspace: (orgId) =>
      sources.find((source) => source.orgId === orgId && source.managed) ?? null,
    insert: () => {
      throw new Error('org execution replica is read-only');
    },
    updateVisibility: () => {
      throw new Error('org execution replica is read-only');
    },
    updateName: () => {
      throw new Error('org execution replica is read-only');
    },
    updateDistribution: () => {
      throw new Error('org execution replica is read-only');
    },
    updateVcs: () => {
      throw new Error('org execution replica is read-only');
    },
    updateAvailability: () => {
      throw new Error('org execution replica is read-only');
    },
    updateLspJson: () => {
      throw new Error('org execution replica is read-only');
    },
    remove: () => {
      throw new Error('org execution replica is read-only');
    },
  } as SourceRegistryPort;
}

export function createSnapshotSourceLocation(
  sources: SourceRegistryPort,
  materializations: SourceMaterializationPort,
  layout: HostFsLayoutPort,
): SourceLocationPort {
  return new SnapshotSourceLocation(sources, materializations, layout);
}

class SnapshotSourceLocation extends SourceLocationPort {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly layout: HostFsLayoutPort,
  ) {
    super();
  }

  resolve(input: ResolveSourceLocationInput): ResolvedSourceLocation {
    return resolveSourceLocation(
      {
        findSource: (orgId, sourceId) => this.sources.findById(orgId, sourceId),
        findMaterialization: (orgId, sourceId, hostId) =>
          this.materializations.find(orgId, sourceId, hostId),
        managedRoot: (orgId, sourceId) => this.layout.orgSourceDir(orgId, sourceId),
        worktreesRoot: (orgId, sourceId) => this.layout.sourceWorktreesDir(orgId, sourceId),
      },
      input,
      resolveContentRoot,
    );
  }
}

export function createSnapshotOrgSettings(snapshot: OrgExecutionSnapshot): OrgSettingsPort {
  return {
    get: () => ({
      skillsSourceAutoLoad: snapshot.runtime.skillsSourceAutoLoad,
      timezone: snapshot.runtime.timezone,
      browser: snapshot.runtime.browser,
    }),
    set: () => {
      throw new Error('org execution replica is read-only');
    },
  } as OrgSettingsPort;
}

export function createSnapshotFileRules(snapshot: OrgExecutionSnapshot): FileAccessRulePort {
  const rules = snapshot.fileAccessRules;
  return {
    list: (orgId) => rules.filter((rule) => rule.orgId === orgId),
    listForAgent: (orgId, agentId) =>
      rules.filter(
        (rule) => rule.orgId === orgId && (rule.agentId === agentId || rule.agentId === null),
      ),
    insert: () => {
      throw new Error('org execution replica is read-only');
    },
    remove: () => {
      throw new Error('org execution replica is read-only');
    },
  } as FileAccessRulePort;
}
