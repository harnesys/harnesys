import { AddonError, type CloudRemoteEntryWire, type SourceBackendHandlers } from '@harnesys/sdk';
import { githubJson } from './github-client.ts';
import { isRecord, stringField } from './github-mappers.ts';

const PER_PAGE = 100;
const ROOT_FOLDER_ID = 'root';

export const githubReposSource: SourceBackendHandlers = {
  async list(params, ctx) {
    if (params.folderId !== ROOT_FOLDER_ID && params.folderId !== '') {
      return { entries: [] };
    }
    const page = pageOf(params.pageToken);
    const wire = await githubJson<{ repositories: unknown[] }>(ctx, {
      accountId: params.accountId,
      path: '/installation/repositories',
      query: new URLSearchParams({ per_page: String(PER_PAGE), page: String(page) }),
    });
    const rows = Array.isArray(wire.repositories) ? wire.repositories : [];
    const entries = rows
      .filter(isRecord)
      .map(repoEntryOf)
      .sort((a, b) => a.name.localeCompare(b.name));
    return rows.length === PER_PAGE ? { entries, nextPageToken: String(page + 1) } : { entries };
  },

  async stat(params, ctx) {
    let wire: Record<string, unknown>;
    try {
      wire = await githubJson<Record<string, unknown>>(ctx, {
        accountId: params.accountId,
        path: repoApiPath(params.fileId),
      });
    } catch (error) {
      if (error instanceof AddonError && error.reason === 'not_found') {
        throw new AddonError('not_found', {
          detail: `repository '${params.fileId}' does not exist or is not accessible to this installation`,
        });
      }
      throw error;
    }
    return { entry: repoEntryOf(wire) };
  },
};

function pageOf(pageToken: string | undefined): number {
  if (pageToken === undefined) {
    return 1;
  }
  const page = Number.parseInt(pageToken, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function repoEntryOf(raw: Record<string, unknown>): CloudRemoteEntryWire {
  const fullName = stringField(raw, 'full_name');
  if (fullName === null || fullName === '') {
    throw new AddonError('invalid_response', { detail: 'GitHub repository has no full_name' });
  }
  return {
    id: fullName,
    name: fullName,
    kind: 'folder',
    url: stringField(raw, 'clone_url') ?? `https://github.com/${fullName}.git`,
  };
}

function repoApiPath(fileId: string): string {
  const slash = fileId.indexOf('/');
  if (slash <= 0 || slash === fileId.length - 1) {
    throw new AddonError('invalid_params', { detail: `fileId must be owner/name, got: ${fileId}` });
  }
  return `/repos/${encodeURIComponent(fileId.slice(0, slash))}/${encodeURIComponent(fileId.slice(slash + 1))}`;
}
