import type { MaterializationState } from '@harnesys/contracts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';

export interface MaterializeGitSourceInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  url: string;
  branch?: string;
  worktreeId: string;
  layout: HostFsLayoutPort;
  driver: SourceDriverPort;
  materializations: SourceMaterializationPort;
  resolveCredential: ((credRef: string) => Promise<string | null>) | null;
  credRef?: string;
  integrationId?: string;
  integrationCredentialUrl?: string;
}

export interface MaterializeGitSourceResult {
  state: MaterializationState;
  worktreeId: string | null;
  revision: number;
  errorCode?: string;
}

export async function materializeGitSourceOnHost(
  input: MaterializeGitSourceInput,
): Promise<MaterializeGitSourceResult> {
  const existing = input.materializations.find(input.orgId, input.sourceId, input.hostId);
  if (existing?.state === 'ready') {
    if (input.integrationId && input.integrationCredentialUrl) {
      await input.driver
        .configureCredentialHelper({
          layout: {
            bareRepoPath: input.layout.orgSourceDir(input.orgId, input.sourceId),
            worktreesRoot: input.layout.sourceWorktreesDir(input.orgId, input.sourceId),
          },
          remoteUrl: input.url,
          credentialUrl: input.integrationCredentialUrl,
        })
        .catch(() => {});
    }
    return {
      state: 'ready',
      worktreeId: existing.localPath ? basenameId(existing.localPath) : input.worktreeId,
      revision: existing.revision,
    };
  }
  const nextRevision = (existing?.revision ?? 0) + 1;
  const now = new Date().toISOString();
  input.materializations.upsert({
    orgId: input.orgId,
    sourceId: input.sourceId,
    hostId: input.hostId,
    origin: 'managed',
    localPath: null,
    state: 'materializing',
    revision: nextRevision,
    updatedAt: now,
    lastError: null,
  });
  try {
    let url = input.url;
    let credentialUrl: string | null = null;
    if (input.integrationId && input.integrationCredentialUrl) {
      credentialUrl = input.integrationCredentialUrl;
    } else if (input.credRef && input.resolveCredential) {
      const secret = await input.resolveCredential(input.credRef);
      if (secret) {
        url = embedCredential(url, secret);
      }
    }
    input.layout.ensureOrgDataDir(input.orgId);
    const gitLayout = {
      bareRepoPath: input.layout.orgSourceDir(input.orgId, input.sourceId),
      worktreesRoot: input.layout.ensureSourceWorktreesDir(input.orgId, input.sourceId),
    };
    const materialized = await input.driver.ensureMaterialized({
      orgId: input.orgId,
      sourceId: input.sourceId,
      url,
      worktreeId: input.worktreeId,
      branch: input.branch,
      layout: gitLayout,
    });
    if (credentialUrl) {
      await input.driver.configureCredentialHelper({
        layout: gitLayout,
        remoteUrl: input.url,
        credentialUrl,
      });
    }
    const readyAt = new Date().toISOString();
    const readyRevision = nextRevision + 1;
    input.materializations.upsert({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      origin: 'managed',
      localPath: materialized.contentRoot,
      state: 'ready',
      revision: readyRevision,
      updatedAt: readyAt,
      lastError: null,
    });
    return {
      state: 'ready',
      worktreeId: input.worktreeId,
      revision: readyRevision,
    };
  } catch (err) {
    const failedAt = new Date().toISOString();
    const errorCode = sanitizeMaterializeError(err);
    const failedRevision = nextRevision + 1;
    input.materializations.upsert({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      origin: 'managed',
      localPath: null,
      state: 'failed',
      revision: failedRevision,
      updatedAt: failedAt,
      lastError: errorCode,
    });
    return {
      state: 'failed',
      worktreeId: null,
      revision: failedRevision,
      errorCode,
    };
  }
}

function basenameId(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function sanitizeMaterializeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'materialize_failed';
  return raw.replace(/\/\/[^/@\s]+@/g, '//').slice(0, 200) || 'materialize_failed';
}

function embedCredential(url: string, secret: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.username) {
      parsed.username = 'x-access-token';
    }
    parsed.password = secret;
    return parsed.toString();
  } catch {
    return url;
  }
}
