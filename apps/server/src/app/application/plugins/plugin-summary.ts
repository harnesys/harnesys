import { existsSync } from 'node:fs';
import type {
  PluginComponentSummary,
  PluginDiagnostic,
  PluginListItem,
  PluginOptionValue,
  PluginSummary,
} from '@harnesys/contracts';
import type { ConfigOptionSpec, PluginComponent, PluginIr, PluginKind } from 'harnesys';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { PluginInstallRecord } from '../../domain/plugin/plugin.ts';
import { MASKED_OPTION } from './plugin-options.ts';

type PluginOptionValueRecord = Record<string, PluginOptionValue>;

export async function toListItem(record: PluginInstallRecord): Promise<PluginListItem> {
  if (!existsSync(record.path)) {
    return {
      plugin: unloadedSummary(record),
      diagnostics: [
        {
          level: 'error',
          code: 'invalid_component',
          message: `plugin checkout not found: ${record.path}`,
          path: record.path,
        },
      ],
    };
  }
  try {
    const loaded = await loadPluginIrFromDirectory({
      root: record.path,
      pluginData: record.dataPath,
    });
    return {
      plugin: toPluginSummary(record, loaded.ir),
      diagnostics: loaded.diagnostics as PluginDiagnostic[],
    };
  } catch (err) {
    return {
      plugin: unloadedSummary(record),
      diagnostics: [
        {
          level: 'error',
          code: 'invalid_component',
          message: err instanceof Error ? err.message : 'plugin load failed',
          path: record.path,
        },
      ],
    };
  }
}

export function toPluginSummary(record: PluginInstallRecord, ir: PluginIr): PluginSummary {
  const summary: PluginSummary = {
    orgId: record.orgId,
    name: record.name,
    source: record.source,
    revision: record.revision,
    path: record.path,
    dataPath: record.dataPath,
    format: ir.sourceFormat,
    grants: record.grants,
    options: maskedOptions(record, ir),
    components: ir.components.map(toComponentSummary),
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
    skillCount: countKind(ir, 'skill'),
    hookCount: countKind(ir, 'hook'),
    mcpServerCount: countKind(ir, 'mcp-server'),
    agentCount: countKind(ir, 'agent'),
    commandCount: countKind(ir, 'command'),
    lspServerCount: countKind(ir, 'lsp-server'),
  };
  if (record.registryId) {
    summary.registryId = record.registryId;
  }
  if (record.catalogPluginName) {
    summary.catalogPluginName = record.catalogPluginName;
  }
  if (ir.identity.version !== undefined) {
    summary.version = ir.identity.version;
  }
  if (ir.identity.description !== undefined) {
    summary.description = ir.identity.description;
  }
  return summary;
}

export function unloadedSummary(record: PluginInstallRecord): PluginSummary {
  return {
    orgId: record.orgId,
    name: record.name,
    source: record.source,
    revision: record.revision,
    path: record.path,
    dataPath: record.dataPath,
    format: record.format,
    grants: record.grants,
    options: record.options,
    components: [],
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
    skillCount: 0,
    hookCount: 0,
    mcpServerCount: 0,
    agentCount: 0,
    commandCount: 0,
    lspServerCount: 0,
    ...(record.registryId ? { registryId: record.registryId } : {}),
    ...(record.catalogPluginName ? { catalogPluginName: record.catalogPluginName } : {}),
  };
}

function toComponentSummary(component: PluginComponent): PluginComponentSummary {
  const item: PluginComponentSummary = {
    kind: component.kind,
    status: component.status,
    source: component.source,
  };
  if (component.inertReason !== undefined) {
    item.inertReason = component.inertReason;
  }
  return item;
}

function countKind(ir: PluginIr, kind: PluginKind): number {
  return ir.components.filter((component) => component.kind === kind).length;
}

function maskedOptions(record: PluginInstallRecord, ir: PluginIr): PluginOptionValueRecord {
  const sensitive = new Set<string>();
  for (const component of ir.components) {
    if (component.kind !== 'config-option') {
      continue;
    }
    const spec = component.spec as ConfigOptionSpec;
    if (spec.sensitive === true) {
      sensitive.add(spec.key);
    }
  }
  if (sensitive.size === 0) {
    return record.options;
  }
  const options: PluginOptionValueRecord = { ...record.options };
  for (const key of sensitive) {
    if (options[key] !== undefined) {
      options[key] = MASKED_OPTION;
    }
  }
  return options;
}
