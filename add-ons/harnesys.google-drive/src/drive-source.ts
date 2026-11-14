import {
  type AddonContext,
  AddonError,
  type CloudRemoteEntryWire,
  type SourceBackendHandlers,
} from '@harnesys/sdk';
import {
  childrenQuery,
  DRIVE_API,
  type DriveFile,
  type DriveListResponse,
  decodeBase64,
  driveBytes,
  driveError,
  driveFetch,
  driveJson,
  driveUpload,
  encodeBase64,
  FOLDER_MIME,
  fileUrl,
  listUrl,
} from './drive-client.ts';

const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,trashed';

export const googleDriveSource: SourceBackendHandlers = {
  async list(params, ctx) {
    const json = await driveJson<DriveListResponse>(ctx, {
      accountId: params.accountId,
      url: listUrl(childrenQuery(params.folderId), params.pageToken),
    });
    const entries = (json.files ?? []).map(toEntry);
    return json.nextPageToken === undefined || json.nextPageToken === ''
      ? { entries }
      : { entries, nextPageToken: json.nextPageToken };
  },

  async stat(params, ctx) {
    const file = await driveJson<DriveFile>(ctx, {
      accountId: params.accountId,
      url: fileUrl(params.fileId, { fields: FILE_FIELDS }),
    });
    return { entry: toEntry(file) };
  },

  async download(params, ctx) {
    return readRange(ctx, {
      accountId: params.accountId,
      url: fileUrl(params.fileId, { alt: 'media' }),
      offset: params.offset ?? 0,
      length: params.length,
    });
  },

  async export(params, ctx) {
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(params.fileId)}/export`);
    url.searchParams.set('mimeType', params.mimeType);
    url.searchParams.set('supportsAllDrives', 'true');
    return readRange(ctx, {
      accountId: params.accountId,
      url: url.toString(),
      offset: params.offset ?? 0,
      length: params.length,
    });
  },

  async upload(params, ctx) {
    const file = await driveUpload(ctx, {
      accountId: params.accountId,
      parentId: params.parentId,
      name: params.name,
      data: decodeBase64(params.data),
      ...(params.fileId === undefined ? {} : { fileId: params.fileId }),
      ...(params.mimeType === undefined ? {} : { mimeType: params.mimeType }),
    });
    if (typeof file.id !== 'string' || file.id === '') {
      throw new AddonError('invalid_response', { detail: 'Drive upload returned no file id' });
    }
    return {
      id: file.id,
      name: typeof file.name === 'string' ? file.name : params.name,
      ...(typeof file.modifiedTime === 'string' ? { modifiedAt: file.modifiedTime } : {}),
    };
  },

  async mkdir(params, ctx) {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('fields', FILE_FIELDS);
    const file = await driveJson<DriveFile>(ctx, {
      accountId: params.accountId,
      method: 'POST',
      url: url.toString(),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        mimeType: FOLDER_MIME,
        parents: [params.parentId],
      }),
    });
    if (typeof file.id !== 'string' || file.id === '') {
      throw new AddonError('invalid_response', { detail: 'Drive folder creation returned no id' });
    }
    return { id: file.id, name: typeof file.name === 'string' ? file.name : params.name };
  },

  async remove(params, ctx) {
    const result = await driveFetch(ctx, {
      accountId: params.accountId,
      method: 'DELETE',
      url: fileUrl(params.fileId),
    });
    if (result.status < 200 || result.status >= 300) {
      throw driveError(result.status, result.text);
    }
  },
};

async function readRange(
  ctx: AddonContext,
  input: { accountId?: string; url: string; offset: number; length?: number },
): Promise<{ data: string; eof: boolean }> {
  if (ctx.signal.aborted) {
    throw new AddonError('cancelled', { detail: 'source read cancelled' });
  }
  const requested =
    input.length !== undefined && input.length > 0 ? input.length : DEFAULT_CHUNK_BYTES;
  const { bytes, status } = await driveBytes(ctx, {
    accountId: input.accountId,
    url: input.url,
    headers: { range: `bytes=${input.offset}-${input.offset + requested - 1}` },
  });
  if (status === 416) {
    return { data: '', eof: true };
  }
  return { data: encodeBase64(bytes), eof: bytes.byteLength < requested };
}

function toEntry(file: DriveFile): CloudRemoteEntryWire {
  if (typeof file.id !== 'string' || file.id === '') {
    throw new AddonError('invalid_response', { detail: 'Drive entry has no id' });
  }
  const size = file.size === undefined ? undefined : Number(file.size);
  return {
    id: file.id,
    name: typeof file.name === 'string' && file.name !== '' ? file.name : file.id,
    kind: file.mimeType === FOLDER_MIME ? 'folder' : 'file',
    ...(size === undefined || Number.isNaN(size) ? {} : { size }),
    ...(typeof file.modifiedTime === 'string' ? { modifiedAt: file.modifiedTime } : {}),
    ...(typeof file.mimeType === 'string' ? { mimeType: file.mimeType } : {}),
  };
}
