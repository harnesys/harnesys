import {
  type CloudDocumentExporter,
  CloudRemoteBackendPort,
  type CloudRemoteEntry,
  type CloudRemoteFolderInput,
  type CloudRemoteFolderResult,
  type CloudRemoteUploadInput,
  type CloudRemoteUploadResult,
} from '../../../../domain/source/cloud-remote-backend.port.ts';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const GOOGLE_APPS_EXPORTS: Record<string, { exportMime: string; extension: string }> = {
  'application/vnd.google-apps.document': { exportMime: DOCX_MIME, extension: 'docx' },
  'application/vnd.google-apps.spreadsheet': { exportMime: XLSX_MIME, extension: 'xlsx' },
  'application/vnd.google-apps.presentation': { exportMime: 'application/pdf', extension: 'pdf' },
  'application/vnd.google-apps.drawing': { exportMime: 'application/pdf', extension: 'pdf' },
};

export type AccessTokenProvider = () => Promise<string>;

export class GoogleDriveBackend extends CloudRemoteBackendPort implements CloudDocumentExporter {
  readonly vendor = 'google' as const;

  constructor(private readonly getAccessToken: AccessTokenProvider) {
    super();
  }

  async exportDocument(fileId: string, mimeType: string): Promise<Uint8Array> {
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/export`);
    url.searchParams.set('mimeType', mimeType);
    const token = await this.getAccessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Google Drive export failed: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async listChildren(folderId: string): Promise<CloudRemoteEntry[]> {
    const entries: CloudRemoteEntry[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${DRIVE_API}/files`);
      url.searchParams.set('q', `'${escapeDriveQuery(folderId)}' in parents and trashed = false`);
      url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime)');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }
      const json = await this.driveJson(url);
      const files = Array.isArray(json.files) ? json.files : [];
      entries.push(...files.map((row) => mapEntry(asRecord(row))));
      pageToken = typeof json.nextPageToken === 'string' ? json.nextPageToken : undefined;
    } while (pageToken);
    return entries;
  }

  async download(fileId: string): Promise<Uint8Array> {
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set('alt', 'media');
    const token = await this.getAccessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Google Drive download failed: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async upload(input: CloudRemoteUploadInput): Promise<CloudRemoteUploadResult> {
    const token = await this.getAccessToken();
    if (input.fileId) {
      const url = new URL(`${UPLOAD_API}/files/${encodeURIComponent(input.fileId)}`);
      url.searchParams.set('uploadType', 'media');
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': input.mimeType ?? 'application/octet-stream',
        },
        body: Buffer.from(input.content),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        throw new Error(`Google Drive update failed: ${res.status} ${JSON.stringify(json)}`);
      }
      const obj = asRecord(json);
      return {
        id: String(obj.id ?? input.fileId),
        name: String(obj.name ?? input.name),
        modifiedAt: typeof obj.modifiedTime === 'string' ? obj.modifiedTime : undefined,
      };
    }
    const metadata = {
      name: input.name,
      parents: [input.parentId],
      mimeType: input.mimeType ?? 'application/octet-stream',
    };
    const boundary = `harnesys_${crypto.randomUUID().replace(/-/g, '')}`;
    const metaPart = JSON.stringify(metadata);
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`,
      ),
      Buffer.from(`--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`),
      Buffer.from(input.content),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const url = new URL(`${UPLOAD_API}/files`);
    url.searchParams.set('uploadType', 'multipart');
    url.searchParams.set('fields', 'id,name,modifiedTime');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const json: unknown = await res.json();
    if (!res.ok) {
      throw new Error(`Google Drive create failed: ${res.status} ${JSON.stringify(json)}`);
    }
    const obj = asRecord(json);
    return {
      id: String(obj.id ?? ''),
      name: String(obj.name ?? input.name),
      modifiedAt: typeof obj.modifiedTime === 'string' ? obj.modifiedTime : undefined,
    };
  }

  async createFolder(input: CloudRemoteFolderInput): Promise<CloudRemoteFolderResult> {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set('fields', 'id,name');
    const token = await this.getAccessToken();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: input.name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [input.parentId],
      }),
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        `Google Drive folder creation failed: ${response.status} ${JSON.stringify(json)}`,
      );
    }
    const obj = asRecord(json);
    const id = typeof obj.id === 'string' ? obj.id : '';
    if (!id) {
      throw new Error('Google Drive folder creation returned no id');
    }
    return { id, name: typeof obj.name === 'string' ? obj.name : input.name };
  }

  async delete(fileId: string): Promise<void> {
    const token = await this.getAccessToken();
    const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(`Google Drive delete failed: ${response.status} ${body}`);
    }
  }

  async getMetadata(fileId: string): Promise<CloudRemoteEntry> {
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set('fields', 'id,name,mimeType,size,modifiedTime');
    const json = await this.driveJson(url);
    return mapEntry(json);
  }

  private async driveJson(url: URL): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json: unknown = await res.json();
    if (!res.ok) {
      throw new Error(`Google Drive API failed: ${res.status} ${JSON.stringify(json)}`);
    }
    return asRecord(json);
  }
}

function mapEntry(row: Record<string, unknown>): CloudRemoteEntry {
  const mimeType = typeof row.mimeType === 'string' ? row.mimeType : undefined;
  const kind = mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file';
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    kind,
    size: row.size !== undefined ? Number(row.size) : undefined,
    modifiedAt: typeof row.modifiedTime === 'string' ? row.modifiedTime : undefined,
    mimeType,
  };
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}
