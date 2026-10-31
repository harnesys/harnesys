import { readFileSync } from 'node:fs';
import { Injectable } from '@harnesys/brix';
import type {
  AgentGraph,
  AgentModelRef,
  BindDiagnosticSink,
  CursorMcpJson,
  LspServerSpec,
  McpServerEntries,
  McpServerSpec,
  PluginComponent,
  PluginDiagnostic,
  PluginIr,
  PluginMcpBinding,
  SkillRegistry,
  UserConfigContentOptions,
} from 'harnesys';
import {
  bindAgentComponents,
  bindSkillComponents,
  CONSOLE_LOGGER,
  composeSkillRegistries,
  mergePluginMcpFragments,
  pluginAgentNameOf,
  substituteUserConfig,
} from 'harnesys';
import { FsSkillRegistry, loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import { buildReactGraph, type ReactGraph } from '../../application/agents/react-preset.ts';
import { resolveMcpVaultJson } from '../../application/mcp/resolve-mcp-vault-placeholders.ts';
import { applyGrantGating } from '../../application/plugins/plugin-grant-gate.ts';
import {
  pluginUserConfig,
  withStoredSecrets,
} from '../../application/plugins/plugin-user-config.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { PluginInstallRecord } from '../../domain/plugin/plugin.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import type {
  LoadedOrgPlugin,
  PluginAgentEntry,
  PluginLspEntry,
  PluginRuntimeBundle,
} from '../../domain/plugin/plugin-runtime.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { SkillsTierCache } from '../skills/skills-tier-cache.ts';

@Injectable()
export class PluginRuntimeAdapter extends PluginRuntimePort {
  private readonly bundles = new Map<string, Promise<PluginRuntimeBundle>>();
  private readonly irCache = new Map<string, PluginIr>();

  constructor(
    private readonly plugins: PluginRegistryPort,
    private readonly layout: HostFsLayoutPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly tiers: SkillsTierCache,
  ) {
    super();
  }

  bundle(orgId: string): Promise<PluginRuntimeBundle> {
    const cached = this.bundles.get(orgId);
    if (cached) {
      return cached;
    }
    const pending = this.createBundle(orgId);
    this.bundles.set(orgId, pending);
    pending.catch(() => {
      if (this.bundles.get(orgId) === pending) {
        this.bundles.delete(orgId);
      }
    });
    return pending;
  }

  invalidate(orgId: string): void {
    this.bundles.delete(orgId);
    for (const record of this.plugins.list(orgId)) {
      this.evictIrFor(`${record.name}@`);
    }
  }

  private evictIrFor(prefix: string): void {
    for (const key of [...this.irCache.keys()]) {
      if (key.startsWith(prefix)) {
        this.irCache.delete(key);
      }
    }
  }

  private async createBundle(orgId: string): Promise<PluginRuntimeBundle> {
    const entries: LoadedOrgPlugin[] = [];
    for (const record of this.plugins.list(orgId)) {
      const raw = await this.loadIr(record);
      if (raw === undefined) {
        continue;
      }
      const approved = new Set(this.plugins.approvals(orgId, record.name));
      const ir = applyGrantGating(raw, record.grants, approved);
      const baseConfig = pluginUserConfig(ir, record.options);
      entries.push({
        record,
        ir,
        userConfig: await withStoredSecrets(this.secrets, orgId, ir, baseConfig),
      });
    }
    const disabled = disabledServerKeys(this.plugins, orgId);
    const merged = mergePluginMcpFragments(
      readBaseMcpJson(this.layout.mcpConfigPath(orgId)),
      entries.map((entry) => toMcpBinding(entry, disabled)),
    );
    const onDiagnostic: BindDiagnosticSink = (diagnostic: PluginDiagnostic) => {
      CONSOLE_LOGGER.warn(`[plugins] ${diagnostic.code}: ${diagnostic.message}`);
    };
    for (const diagnostic of merged.diagnostics) {
      onDiagnostic(diagnostic);
    }
    const mcpJson = await resolveMcpVaultJson(
      merged.mcp,
      (key) => this.secrets.get(orgId, key),
      (message) => CONSOLE_LOGGER.warn(`[mcp] ${message}`),
    );
    return {
      entries,
      skills: composeSkills(this.layout.skillsDir(orgId), entries, this.tiers),
      mcpJson,
      agents: composeAgents(orgId, entries, onDiagnostic, this.providers, this.models),
      lspServers: collectLspServers(entries, disabled),
    };
  }

  private async loadIr(record: PluginInstallRecord): Promise<PluginIr | undefined> {
    const key = `${record.name}@${record.revision}`;
    const cached = this.irCache.get(key);
    if (cached) {
      return cached;
    }
    try {
      const result = await loadPluginIrFromDirectory({
        root: record.path,
        pluginData: record.dataPath,
      });
      this.irCache.set(key, result.ir);
      return result.ir;
    } catch {
      return undefined;
    }
  }
}

function readSkillFile(file: string): string {
  return readFileSync(file, 'utf8');
}

function composeSkills(
  orgRoot: string,
  entries: LoadedOrgPlugin[],
  tiers: SkillsTierCache,
): SkillRegistry {
  return composeSkillRegistries([
    ...tiers.registries(),
    new FsSkillRegistry({ roots: [orgRoot] }),
    ...entries.map((entry) => bindSkillComponents(entry.ir, readSkillFile, entry.userConfig)),
  ]);
}

function disabledServerKeys(plugins: PluginRegistryPort, orgId: string): Set<string> {
  return new Set(
    plugins
      .listDisabledServers(orgId)
      .map((entry) => `plugin:${entry.pluginName}:${entry.serverId}`),
  );
}

function isNativeMcp(
  component: PluginComponent,
): component is PluginComponent & { spec: McpServerSpec } {
  return component.kind === 'mcp-server' && component.status === 'native';
}

function toMcpBinding(entry: LoadedOrgPlugin, disabled: ReadonlySet<string>): PluginMcpBinding {
  return {
    name: entry.record.name,
    pluginRoot: entry.record.path,
    pluginData: entry.record.dataPath,
    servers: entry.ir.components
      .filter(isNativeMcp)
      .map((component) => component.spec)
      .filter((spec) => !disabled.has(`plugin:${entry.record.name}:${spec.serverId}`)),
    userConfig: entry.userConfig,
  };
}

function isNativeLsp(
  component: PluginComponent,
): component is PluginComponent & { spec: LspServerSpec } {
  return component.kind === 'lsp-server' && component.status === 'native';
}

function collectLspServers(
  entries: LoadedOrgPlugin[],
  disabled: ReadonlySet<string>,
): PluginLspEntry[] {
  const out: PluginLspEntry[] = [];
  for (const entry of entries) {
    for (const component of entry.ir.components) {
      if (!isNativeLsp(component)) {
        continue;
      }
      const serverId = pluginLspServerId(entry.record.name, component.spec.serverId);
      const substituted = substituteLspSpec(component.spec, entry.userConfig);
      if (substituted === undefined) {
        continue;
      }
      out.push({
        serverId,
        plugin: entry.record.name,
        spec: substituted,
        disabled: disabled.has(serverId),
      });
    }
  }
  return out;
}

export function pluginLspServerId(pluginName: string, serverId: string): string {
  return `plugin:${pluginName}:${serverId}`;
}

function substituteLspSpec(
  spec: LspServerSpec,
  userConfig: UserConfigContentOptions,
): LspServerSpec | undefined {
  const substitute = (value: string): string | undefined => {
    const result = substituteUserConfig(value, userConfig.values, userConfig.sensitiveKeys);
    return typeof result === 'string' ? result : undefined;
  };
  const command = substitute(spec.command);
  if (command === undefined) {
    return undefined;
  }
  if (spec.args === undefined) {
    return { ...spec, command };
  }
  const args: string[] = [];
  for (const arg of spec.args) {
    const substituted = substitute(arg);
    if (substituted === undefined) {
      return undefined;
    }
    args.push(substituted);
  }
  return { ...spec, command, args };
}

function composeAgents(
  orgId: string,
  entries: LoadedOrgPlugin[],
  onDiagnostic: BindDiagnosticSink,
  providers: LlmProviderPort,
  models: LlmModelPort,
): PluginAgentEntry[] {
  const out: PluginAgentEntry[] = [];
  for (const entry of entries) {
    const bound = bindAgentComponents(entry.ir, {
      resolveModel: (ref: string) => resolvePluginModel(orgId, ref, providers, models),
      onDiagnostic,
      userConfig: entry.userConfig,
      packIndex: undefined,
    });
    for (const agent of bound) {
      out.push({
        id: agent.id,
        plugin: entry.record.name,
        name: pluginAgentNameOf(agent.id),
        definition: { ...agent.definition, graph: buildReactGraph() as ReactAgentGraph },
      });
    }
  }
  return out;
}

type ReactAgentGraph = ReactGraph & AgentGraph;

function resolvePluginModel(
  orgId: string,
  ref: string,
  providers: LlmProviderPort,
  models: LlmModelPort,
): AgentModelRef | null {
  const separator = ref.indexOf('/');
  const modelName = separator === -1 ? ref : ref.slice(separator + 1);
  const provider =
    separator === -1
      ? providers.list(orgId).find((row) => models.findByProviderAndName(orgId, row.id, modelName))
      : providers.findByName(orgId, ref.slice(0, separator));
  if (provider === undefined) {
    return null;
  }
  const model = models.findByProviderAndName(orgId, provider.id, modelName);
  return model === undefined ? null : { provider: provider.name, model: model.name };
}

function readBaseMcpJson(path: string): CursorMcpJson {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers?: unknown };
    if (typeof parsed.mcpServers === 'object' && parsed.mcpServers !== null) {
      return { mcpServers: parsed.mcpServers as McpServerEntries };
    }
  } catch {
    // missing or invalid org mcp.json: plugin servers merge into an empty base
  }
  return { mcpServers: {} };
}
