import { createHash } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import {
  type OrgExecutionSnapshot,
  OrgExecutionSnapshotSchema,
  type ProviderSnapshot,
} from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import {
  LEGACY_PROVIDER_SECRET_PREFIX,
  parseVaultRef,
  VAULT_SECRET_PREFIX,
} from '../../domain/secret/vault-keys.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { toAgentPublic } from '../agents/agent.helpers.ts';

@Injectable()
export class BuildOrgExecutionSnapshotUseCase {
  constructor(
    private readonly agents: AgentRegistryPort,
    private readonly sources: SourceRegistryPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly orgSettings: OrgSettingsPort,
    private readonly revisions: OrgConfigRevisionPort,
    private readonly hub: FleetHubPort,
    private readonly fileRules: FileAccessRulePort,
  ) {}

  execute(orgId: string): OrgExecutionSnapshot {
    const agents = this.agents.list(orgId).map(toAgentPublic);
    const sources = this.sources.list(orgId).map((source) => ({
      id: source.id,
      orgId: source.orgId,
      name: source.name,
      distribution: source.distribution,
      uiVisibility: source.uiVisibility,
      managed: source.managed,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    }));
    const providerRows = this.providers.list(orgId);
    const providers: ProviderSnapshot[] = providerRows.map((provider) => ({
      id: provider.id,
      orgId: provider.orgId,
      name: provider.name,
      driver: provider.driver,
      apiUrl: provider.apiUrl,
      apiKeyRef: providerApiKeyRef(provider.id, provider.apiKey),
      headers: provider.headers,
      enabled: provider.enabled,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    }));
    const models = providerRows.flatMap((provider) =>
      this.models.listByProvider(orgId, provider.id).map((model) => ({
        id: model.id,
        providerId: model.providerId,
        name: model.name,
        kind: model.kind,
        metadata: model.metadata,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      })),
    );
    const settings = this.orgSettings.get(orgId);
    const fileAccessRules = this.fileRules.list(orgId);
    const contentHash = hashSnapshotContent({
      agents,
      sources,
      providers,
      models,
      fileAccessRules,
      runtime: {
        skillsSourceAutoLoad: settings.skillsSourceAutoLoad,
        timezone: settings.timezone,
        browser: settings.browser,
      },
    });
    const { revision, bumped } = this.revisions.sync(orgId, contentHash);
    const snapshot = OrgExecutionSnapshotSchema.parse({
      schemaVersion: 1,
      revision,
      agents,
      sources,
      providers,
      models,
      fileAccessRules,
      runtime: {
        skillsSourceAutoLoad: settings.skillsSourceAutoLoad,
        timezone: settings.timezone,
        browser: settings.browser,
      },
    });
    if (bumped) {
      this.hub.broadcastToOrg(orgId, JSON.stringify({ kind: 'SNAPSHOT', snapshot }));
    }
    return snapshot;
  }

  pushToNode(orgId: string, nodeId: string): OrgExecutionSnapshot {
    const snapshot = this.execute(orgId);
    this.hub.sendToPeer(nodeId, JSON.stringify({ kind: 'SNAPSHOT', snapshot }));
    return snapshot;
  }
}

export function providerApiKeyRef(providerId: string, apiKey: string | null): string | null {
  if (!apiKey) {
    return `${LEGACY_PROVIDER_SECRET_PREFIX}${providerId}`;
  }
  const ref = parseVaultRef(apiKey);
  if (ref?.kind === 'secret') {
    return `${VAULT_SECRET_PREFIX}${ref.name}`;
  }
  if (apiKey.startsWith(LEGACY_PROVIDER_SECRET_PREFIX)) {
    return apiKey;
  }
  return `${LEGACY_PROVIDER_SECRET_PREFIX}${providerId}`;
}

function hashSnapshotContent(content: unknown): string {
  return createHash('sha256').update(stableStringify(content)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}
