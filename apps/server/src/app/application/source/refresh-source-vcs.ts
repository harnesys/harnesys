import type { SourceVcs } from '@harnesys/contracts';
import { decideSourceVcsUpdate } from '../../domain/source/decide-source-vcs.ts';
import type { GitVcsPort, VcsProbeRaw } from '../../domain/source/git-vcs.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface SourceVcsRefresherDeps {
  sources: SourceRegistryPort;
  materializations: SourceMaterializationPort;
  git: GitVcsPort;
  localHostId: string;
}

export async function refreshSourceVcs(
  deps: SourceVcsRefresherDeps,
  orgId: string,
  sourceId: string,
): Promise<SourceVcs | null> {
  const row = deps.sources.findById(orgId, sourceId);
  if (row === null) {
    return null;
  }
  if (row.distribution.kind !== 'host-bound' || row.distribution.hostId !== deps.localHostId) {
    return row.vcs;
  }
  const mat = deps.materializations.find(orgId, sourceId, deps.localHostId);
  if (mat?.state !== 'ready' || mat.localPath === null) {
    return row.vcs;
  }
  let probe: VcsProbeRaw | { error: true };
  try {
    probe = await deps.git.probe(mat.localPath);
  } catch {
    probe = { error: true };
  }
  const decision = decideSourceVcsUpdate(row.vcs, probe);
  if (decision === undefined) {
    return row.vcs;
  }
  deps.sources.updateVcs(orgId, sourceId, decision);
  return decision;
}
