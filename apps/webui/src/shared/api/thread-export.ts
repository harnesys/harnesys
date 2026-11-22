import { getActiveOrgId } from './active-org';
import { ApiError, apiUrl } from './client';
import { authenticatedFetch } from './session';
import { threadsBase } from './threads';

export async function downloadThreadExport(
  threadId: string,
  onProgress?: (receivedBytes: number) => void,
): Promise<void> {
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
  const blob = await zipBlob(response, onProgress);
  await assertCompleteZip(blob);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function zipBlob(
  response: Response,
  onProgress?: (receivedBytes: number) => void,
): Promise<Blob> {
  const body = response.body;
  if (!body || !onProgress) {
    return response.blob();
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    chunks.push(value);
    received += value.byteLength;
    onProgress(received);
  }
  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

async function assertCompleteZip(blob: Blob): Promise<void> {
  const tail = new Uint8Array(
    await blob.slice(Math.max(0, blob.size - 22), blob.size).arrayBuffer(),
  );
  const hasEndOfCentralDirectory =
    tail.length >= 4 &&
    tail[0] === 0x50 &&
    tail[1] === 0x4b &&
    tail[2] === 0x05 &&
    tail[3] === 0x06;
  if (!hasEndOfCentralDirectory) {
    throw new ApiError(500, 'Thread export incomplete');
  }
}

function fileNameFromDisposition(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /filename="?([^";]+)"?/i.exec(value);
  return match?.[1] ?? null;
}
