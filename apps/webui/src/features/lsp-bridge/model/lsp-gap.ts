import type { LspCatalogEntry, OrgLspEntry, OrgLspListResponse } from '@harnesys/contracts';
import { extensionOfPath, findServersForPath, matchesPathExtensions } from './lsp-path';

export interface LspInstallCandidate {
  serverId: string;
  label: string;
  install: string;
  command: string;
  args?: string[];
  extensionToLanguage: Record<string, string>;
  configured: boolean;
  binaryOk: boolean;
}

export interface LspGap {
  usable: boolean;
  message: string;
  candidate?: LspInstallCandidate;
}

export function resolveLspGap(list: OrgLspListResponse, path: string): LspGap {
  const catalog = list.catalog ?? [];
  const matches = findServersForPath(list.servers, path);
  const active = matches.find((server) => !server.disabled) ?? matches[0];
  if (active !== undefined) {
    return gapForServer(active, catalog);
  }
  const candidate = catalogCandidate(catalog, path);
  if (candidate === undefined) {
    return { usable: false, message: noServerMessage(path) };
  }
  return { usable: false, message: candidateMessage(candidate), candidate };
}

function gapForServer(server: OrgLspEntry, catalog: LspCatalogEntry[]): LspGap {
  if (server.disabled) {
    return {
      usable: false,
      message: `LSP server "${server.serverId}" is disabled — re-enable it in Settings → LSP`,
    };
  }
  if (!server.granted) {
    return {
      usable: false,
      message: `LSP server "${server.serverId}" is not granted — approve the plugin, then press Restart`,
    };
  }
  if (server.binaryOk) {
    return { usable: true, message: '' };
  }
  if (server.origin === 'file') {
    const entry =
      catalog.find((item) => item.serverId === server.serverId) ??
      catalog.find((item) => item.command === server.command);
    if (entry !== undefined) {
      return {
        usable: false,
        message: `LSP server "${server.serverId}" is not installed — install it to get diagnostics`,
        candidate: candidateOf(entry, server.serverId, true, false),
      };
    }
  }
  return {
    usable: false,
    message: `LSP server "${server.serverId}" command "${server.command}" not found on this host`,
  };
}

function catalogCandidate(
  catalog: LspCatalogEntry[],
  path: string,
): LspInstallCandidate | undefined {
  const matches = catalog.filter(
    (entry) => !entry.installed && matchesPathExtensions(entry.extensionToLanguage, path),
  );
  const entry = matches.find((item) => item.binaryOk) ?? matches[0];
  return entry === undefined ? undefined : candidateOf(entry, entry.serverId, false);
}

function candidateOf(
  entry: LspCatalogEntry,
  serverId: string,
  configured: boolean,
  binaryOk: boolean = entry.binaryOk,
): LspInstallCandidate {
  return {
    serverId,
    label: entry.label,
    install: entry.install,
    command: entry.command,
    ...(entry.args !== undefined ? { args: entry.args } : {}),
    extensionToLanguage: entry.extensionToLanguage,
    configured,
    binaryOk,
  };
}

function candidateMessage(candidate: LspInstallCandidate): string {
  return candidate.binaryOk
    ? `"${candidate.label}" is available on this host but not enabled for this project`
    : `"${candidate.label}" language server is not installed`;
}

function noServerMessage(path: string): string {
  const extension = extensionOfPath(path);
  const suffix = extension === undefined ? '(no extension)' : `.${extension}`;
  return `no LSP server for ${suffix} — add one in Settings → LSP or install a plugin that declares lspServers`;
}
