import type { LspServerSpec } from 'harnesys';
import type { PluginLspEntry } from '../../domain/plugin/plugin-runtime.port.ts';
import type { LspServerSpec as FileLspSpec } from './org-lsp-file.ts';

export type ResolvedLspSpec = LspServerSpec | FileLspSpec;

export interface ResolvedLspServer {
  serverId: string;
  spec: ResolvedLspSpec;
  origin: 'file' | 'plugin';
  shadowed: boolean;
}

export function resolveLspServers(
  fileServers: readonly FileLspSpec[],
  pluginServers: readonly PluginLspEntry[],
  disabledKeys: ReadonlySet<string>,
): ResolvedLspServer[] {
  const candidates: ResolvedLspServer[] = [
    ...fileServers.map((spec) => ({
      serverId: `file:${spec.serverId}`,
      spec,
      origin: 'file' as const,
      shadowed: false,
    })),
    ...pluginServers
      .filter((entry) => !entry.disabled && !disabledKeys.has(entry.serverId))
      .map((entry) => ({
        serverId: entry.serverId,
        spec: entry.spec,
        origin: 'plugin' as const,
        shadowed: false,
      })),
  ];
  const owner = new Map<string, ResolvedLspServer>();
  for (const candidate of candidates) {
    for (const ext of Object.keys(candidate.spec.extensionToLanguage)) {
      if (!owner.has(ext)) {
        owner.set(ext, candidate);
      }
    }
  }
  const active = candidates.filter((candidate) => ownsAnyExtension(candidate, owner));
  for (const candidate of active) {
    candidate.shadowed = losesAnyExtension(candidate, owner);
  }
  return active;
}

function ownsAnyExtension(
  candidate: ResolvedLspServer,
  owner: Map<string, ResolvedLspServer>,
): boolean {
  for (const ext of Object.keys(candidate.spec.extensionToLanguage)) {
    if (owner.get(ext) === candidate) {
      return true;
    }
  }
  return false;
}

function losesAnyExtension(
  candidate: ResolvedLspServer,
  owner: Map<string, ResolvedLspServer>,
): boolean {
  for (const ext of Object.keys(candidate.spec.extensionToLanguage)) {
    if (owner.get(ext) !== candidate) {
      return true;
    }
  }
  return false;
}

export function extensionOwnerMap(
  resolved: readonly ResolvedLspServer[],
): Map<string, ResolvedLspServer> {
  const map = new Map<string, ResolvedLspServer>();
  for (const candidate of resolved) {
    if (candidate.shadowed) {
      continue;
    }
    for (const ext of Object.keys(candidate.spec.extensionToLanguage)) {
      if (!map.has(ext)) {
        map.set(ext, candidate);
      }
    }
  }
  return map;
}
