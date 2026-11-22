import { getActiveOrgId } from './active-org';
import { ApiError, apiUrl } from './client';
import { authenticatedFetch } from './session';
import { threadsBase } from './threads';

export async function downloadThreadExport(threadId: string): Promise<void> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active organization');
  }
  const response = await authenticatedFetch(
    apiUrl(`${threadsBase(orgId)}/${encodeURIComponent(threadId)}/export`),
    { headers: { 'X-Org-Id': orgId } },
  );
  if (!response.ok) {
    throw new ApiError(response.status, 'Thread export failed');
  }
  const fileName =
    fileNameFromDisposition(response.headers.get('Content-Disposition')) ??
    `harnesys-thread-${threadId}.zip`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileNameFromDisposition(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /filename="?([^";]+)"?/i.exec(value);
  return match?.[1] ?? null;
}
