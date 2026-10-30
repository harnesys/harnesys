import type { SourceLocationResponse } from '@harnesys/contracts';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';

export async function getSourceLocation(sourceId: string): Promise<SourceLocationResponse | null> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active organization');
  }
  try {
    return await apiJson<SourceLocationResponse>(
      `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/location`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function sourceLocationQueryKey(sourceId: string): readonly ['sources', string, 'location'] {
  return ['sources', sourceId, 'location'] as const;
}
