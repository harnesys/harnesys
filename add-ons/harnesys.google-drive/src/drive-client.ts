import { type AddonContext, AddonError } from '@harnesys/sdk';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

const CONNECTION = 'google';
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,trashed';

export interface DriveCall {
  accountId?: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: string;
  bodyBase64?: string;
  headers?: Record<string, string>;
  binary?: boolean;
}

export interface DriveHttpResult {
  status: number;
  text: string | null;
  bytes: Uint8Array | null;
}

function authOf(accountId: string | undefined): {
  connection: string;
  accountId?: string;
  scheme: 'bearer';
  credentialKey: string;
} {
  return {
    connection: CONNECTION,
    ...(accountId === undefined ? {} : { accountId }),
    scheme: 'bearer',
    credentialKey: 'accessToken',
  };
}

export async function driveFetch(ctx: AddonContext, call: DriveCall): Promise<DriveHttpResult> {
  const response = await ctx.http.fetch({
    url: call.url,
    method: call.method ?? 'GET',
    headers: call.headers ?? {},
    ...(call.body === undefined ? {} : { body: call.body }),
    ...(call.bodyBase64 === undefined ? {} : { bodyBase64: call.bodyBase64 }),
    ...(call.binary === true ? { responseEncoding: 'base64' as const } : {}),
    auth: authOf(call.accountId),
  });
  return {
    status: response.status,
    text: response.body,
    bytes: response.bodyBase64 === undefined ? null : decodeBase64(response.bodyBase64),
  };
}

export async function driveJson<T>(ctx: AddonContext, call: DriveCall): Promise<T> {
  const result = await driveFetch(ctx, call);
  if (result.status < 200 || result.status >= 300) {
    throw driveError(result.status, result.text);
  }
  if (result.text === null) {
    throw new AddonError('invalid_response', { detail: 'Drive returned an empty body' });
  }
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new AddonError('invalid_response', { detail: 'Drive returned invalid JSON' });
  }
}

export async function driveBytes(
  ctx: AddonContext,
  call: DriveCall,
): Promise<{ bytes: Uint8Array; status: number }> {
  const result = await driveFetch(ctx, { ...call, binary: true });
  if (result.status === 416) {
    return { bytes: new Uint8Array(0), status: 416 };
  }
  if (result.status < 200 || result.status >= 300) {
    throw driveError(result.status, result.text);
  }
  return { bytes: result.bytes ?? new Uint8Array(0), status: result.status };
}

export function fileUrl(fileId: string, params?: Record<string, string>): string {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('supportsAllDrives', 'true');
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function listUrl(query: string, pageToken?: string): string {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set('q', query);
  url.searchParams.set('fields', `nextPageToken,files(${FILE_FIELDS})`);
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  if (pageToken !== undefined && pageToken !== '') {
    url.searchParams.set('pageToken', pageToken);
  }
  return url.toString();
}

export function childrenQuery(folderId: string): string {
  const escaped = folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}' in parents and trashed = false`;
}

export interface DriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  trashed?: boolean;
}

export interface DriveListResponse {
  files?: DriveFile[];
  nextPageToken?: string;
}

export async function driveUpload(
  ctx: AddonContext,
  input: {
    accountId?: string;
    parentId: string;
    fileId?: string;
    name: string;
    data: Uint8Array;
    mimeType?: string;
  },
): Promise<DriveFile> {
  const boundary = `harnesys-${Math.random().toString(36).slice(2)}`;
  const metadata: Record<string, unknown> = { name: input.name };
  if (input.mimeType !== undefined) {
    metadata.mimeType = input.mimeType;
  }
  if (input.fileId === undefined) {
    metadata.parents = [input.parentId];
  }
  const target =
    input.fileId === undefined
      ? `${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=${FILE_FIELDS}`
      : `${UPLOAD_API}/files/${encodeURIComponent(input.fileId)}?uploadType=multipart&supportsAllDrives=true&fields=${FILE_FIELDS}`;
  const payload = multipartBody(boundary, metadata, input.data);
  return driveJson<DriveFile>(ctx, {
    accountId: input.accountId,
    method: input.fileId === undefined ? 'POST' : 'PATCH',
    url: target,
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    bodyBase64: encodeBase64(payload),
  });
}

function multipartBody(
  boundary: string,
  metadata: Record<string, unknown>,
  data: Uint8Array,
): Uint8Array {
  const head = Buffer.from(
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return new Uint8Array(Buffer.concat([head, Buffer.from(data), tail]));
}

export function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function decodeBase64(value: string): Uint8Array {
  return value === '' ? new Uint8Array(0) : Uint8Array.from(Buffer.from(value, 'base64'));
}

export function driveError(status: number, body: string | null): AddonError {
  const detail = errorDetail(body);
  if (status === 401) {
    return new AddonError('account_failed', {
      detail: `Google rejected the account credentials: ${detail}`,
      accountCode: 'invalid_credentials',
    });
  }
  if (status === 403 && /quota|rateLimitExceeded|userRateLimitExceeded/i.test(detail)) {
    return new AddonError('rate_limited', { detail, retryable: true });
  }
  if (status === 403) {
    return new AddonError('permission_denied', { detail });
  }
  if (status === 404) {
    return new AddonError('not_found', { detail });
  }
  return new AddonError('invalid_response', { detail: `Drive responded ${status}: ${detail}` });
}

function errorDetail(body: string | null): string {
  if (body === null) {
    return 'no response body';
  }
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    if (typeof message === 'string') {
      return message;
    }
  } catch {
    return body.slice(0, 200);
  }
  return body.slice(0, 200);
}
