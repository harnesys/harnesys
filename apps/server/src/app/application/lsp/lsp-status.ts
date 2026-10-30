import type {
  LspCatalogEntry,
  LspServerStatus,
  OrgLspEntry,
  OrgLspListResponse,
  PluginDiagnostic,
} from '@harnesys/contracts';
import type { PluginLspEntry } from '../../domain/plugin/plugin-runtime.port.ts';
import { LSP_CATALOG } from '../../infra/lsp/lsp-catalog.ts';
import {
  disabledFileEntries,
  hasBinary,
  isFileDisabled,
  type LspServerSpec,
  type OrgLspFile,
} from '../../infra/lsp/org-lsp-file.ts';

export function toLspListResponse(file: OrgLspFile, includeRaw = false): OrgLspListResponse {
  const servers: OrgLspEntry[] = file.servers.map((server) =>
    toEntry(
      { ...server, origin: 'file' },
      {
        disabled: isFileDisabled(file.raw, server.serverId),
        granted: true,
      },
    ),
  );
  for (const entry of disabledFileEntries(file.raw)) {
    if (servers.some((server) => server.serverId === entry.serverId && server.origin === 'file')) {
      continue;
    }
    servers.push(toEntry({ ...entry, origin: 'file' }, { disabled: true, granted: true }));
  }
  const response: OrgLspListResponse = {
    servers,
    diagnostics: file.diagnostics as PluginDiagnostic[],
  };
  if (includeRaw) {
    response.raw = file.raw;
  }
  return response;
}

function toEntry(
  server: LspServerSpec & { origin: string },
  flags: { disabled?: boolean; granted: boolean; lastError?: string },
): OrgLspEntry {
  const disabled = flags.disabled ?? false;
  const binaryOk = hasBinary(server.command);
  let status: LspServerStatus = 'live';
  if (disabled || !flags.granted) {
    status = 'off';
  } else if (!binaryOk || flags.lastError !== undefined) {
    status = 'error';
  }
  return {
    serverId: server.serverId,
    origin: server.origin,
    command: server.command,
    ...(server.args !== undefined ? { args: server.args } : {}),
    extensionToLanguage: server.extensionToLanguage,
    disabled,
    granted: flags.granted,
    binaryOk,
    status,
    ...(flags.lastError !== undefined ? { lastError: flags.lastError } : {}),
  };
}

export type ListablePluginServer = PluginLspEntry & {
  granted: boolean;
  disabled: boolean;
};

export function appendPluginServers(
  response: OrgLspListResponse,
  pluginServers: readonly ListablePluginServer[],
  fileServers: readonly LspServerSpec[],
): void {
  const owner = new Map<string, string>();
  claimExtensions(
    owner,
    fileServers.map((server) => ({
      extensions: Object.keys(server.extensionToLanguage),
      key: `file:${server.serverId}`,
    })),
  );
  for (const entry of pluginServers) {
    const origin = `plugin:${entry.plugin}`;
    const extensions = Object.keys(entry.spec.extensionToLanguage).filter(
      (extension) => owner.get(extension) === undefined,
    );
    if (extensions.length === 0) {
      continue;
    }
    claimExtensions(owner, [{ extensions, key: `${origin}:${entry.serverId}` }]);
    response.servers.push(
      toEntry(
        {
          ...entry.spec,
          extensionToLanguage: pickExtensions(entry.spec.extensionToLanguage, extensions),
          origin,
        },
        { disabled: entry.disabled, granted: entry.granted },
      ),
    );
  }
}

function claimExtensions(
  owner: Map<string, string>,
  claims: readonly { extensions: string[]; key: string }[],
): void {
  for (const claim of claims) {
    for (const extension of claim.extensions) {
      if (!owner.has(extension)) {
        owner.set(extension, claim.key);
      }
    }
  }
}

function pickExtensions(
  source: Record<string, string>,
  extensions: string[],
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const extension of extensions) {
    const language = source[extension];
    if (language !== undefined) {
      picked[extension] = language;
    }
  }
  return picked;
}

export function buildCatalog(file: OrgLspFile, servers: readonly OrgLspEntry[]): LspCatalogEntry[] {
  const known = new Set([
    ...file.servers.map((server) => server.serverId),
    ...disabledFileEntries(file.raw).map((server) => server.serverId),
    ...servers.map((server) => server.serverId),
  ]);
  return LSP_CATALOG.map((spec) => ({
    serverId: spec.serverId,
    label: spec.label,
    description: spec.description,
    command: spec.command,
    ...(spec.args !== undefined ? { args: spec.args } : {}),
    extensionToLanguage: spec.extensionToLanguage,
    install: spec.install,
    installed: known.has(spec.serverId),
    binaryOk: hasBinary(spec.command),
  }));
}
