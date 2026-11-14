import type { CloudRemoteEntryWire } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import type { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import type {
  CloudDocumentExporter,
  CloudRemoteEntry,
  CloudRemoteFolderInput,
  CloudRemoteFolderResult,
  CloudRemoteUploadInput,
  CloudRemoteUploadResult,
} from '../../../domain/source/cloud-remote-backend.port.ts';
import { CloudRemoteBackendPort } from '../../../domain/source/cloud-remote-backend.port.ts';

export interface AddonCloudBackendRef {
  orgId: string;
  addonId: string;
  sourceKindId: string;
  accountId?: string;
}

export const SOURCE_CHUNK_BYTES = 4 * 1024 * 1024;

const SOURCE_CALL_TIMEOUT_MS = 60_000;

export class AddonCloudBackend extends CloudRemoteBackendPort implements CloudDocumentExporter {
  readonly vendor: string;

  constructor(
    private readonly calls: AddonCallPort,
    private readonly ref: AddonCloudBackendRef,
  ) {
    super();
    this.vendor = ref.addonId;
  }

  async listChildren(folderId: string): Promise<CloudRemoteEntry[]> {
    const entries: CloudRemoteEntry[] = [];
    let pageToken: string | undefined;
    do {
      const result = await this.calls.sourceRequest(
        this.ref.orgId,
        this.ref.addonId,
        'source.list',
        { ...this.selector(), folderId, ...(pageToken === undefined ? {} : { pageToken }) },
        { timeoutMs: SOURCE_CALL_TIMEOUT_MS },
      );
      const wire = Array.isArray(result.entries) ? (result.entries as CloudRemoteEntryWire[]) : [];
      for (const row of wire) {
        entries.push(toEntry(row));
      }
      pageToken = typeof result.nextPageToken === 'string' ? result.nextPageToken : undefined;
    } while (pageToken !== undefined && pageToken !== '');
    return entries;
  }

  async getMetadata(fileId: string): Promise<CloudRemoteEntry> {
    const result = await this.calls.sourceRequest(
      this.ref.orgId,
      this.ref.addonId,
      'source.stat',
      { ...this.selector(), fileId },
      { timeoutMs: SOURCE_CALL_TIMEOUT_MS },
    );
    return toEntry(result.entry as CloudRemoteEntryWire);
  }

  async download(fileId: string): Promise<Uint8Array> {
    return this.readBytes('source.download', { fileId });
  }

  async exportDocument(fileId: string, mimeType: string): Promise<Uint8Array> {
    return this.readBytes('source.export', { fileId, mimeType });
  }

  async upload(input: CloudRemoteUploadInput): Promise<CloudRemoteUploadResult> {
    if (input.content.byteLength > SOURCE_CHUNK_BYTES) {
      throw new AddonError('quota_exceeded', {
        detail: `add-on backend upload is limited to ${SOURCE_CHUNK_BYTES} bytes per call`,
      });
    }
    const result = await this.calls.sourceRequest(
      this.ref.orgId,
      this.ref.addonId,
      'source.upload',
      {
        ...this.selector(),
        parentId: input.parentId,
        name: input.name,
        data: base64FromBytes(input.content),
        ...(input.fileId === undefined ? {} : { fileId: input.fileId }),
        ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }),
      },
      { timeoutMs: SOURCE_CALL_TIMEOUT_MS },
    );
    return {
      id: String(result.id ?? ''),
      name: String(result.name ?? ''),
      modifiedAt: typeof result.modifiedAt === 'string' ? result.modifiedAt : undefined,
    };
  }

  async createFolder(input: CloudRemoteFolderInput): Promise<CloudRemoteFolderResult> {
    const result = await this.calls.sourceRequest(
      this.ref.orgId,
      this.ref.addonId,
      'source.mkdir',
      { ...this.selector(), parentId: input.parentId, name: input.name },
      { timeoutMs: SOURCE_CALL_TIMEOUT_MS },
    );
    return { id: String(result.id ?? ''), name: String(result.name ?? '') };
  }

  async delete(fileId: string): Promise<void> {
    await this.calls.sourceRequest(
      this.ref.orgId,
      this.ref.addonId,
      'source.remove',
      { ...this.selector(), fileId },
      { timeoutMs: SOURCE_CALL_TIMEOUT_MS },
    );
  }

  private async readBytes(
    method: 'source.download' | 'source.export',
    target: Record<string, string>,
  ): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let offset = 0;
    for (;;) {
      const result = await this.calls.sourceRequest(
        this.ref.orgId,
        this.ref.addonId,
        method,
        { ...this.selector(), ...target, offset, length: SOURCE_CHUNK_BYTES },
        { timeoutMs: SOURCE_CALL_TIMEOUT_MS },
      );
      const data = typeof result.data === 'string' ? result.data : '';
      const bytes = data === '' ? new Uint8Array(0) : Uint8Array.from(Buffer.from(data, 'base64'));
      chunks.push(bytes);
      offset += bytes.byteLength;
      if (result.eof === true || bytes.byteLength === 0) {
        return concat(chunks);
      }
    }
  }

  private selector(): Record<string, string> {
    return {
      sourceKind: this.ref.sourceKindId,
      ...(this.ref.accountId === undefined ? {} : { accountId: this.ref.accountId }),
    };
  }
}

function toEntry(wire: CloudRemoteEntryWire): CloudRemoteEntry {
  return {
    id: wire.id,
    name: wire.name,
    kind: wire.kind,
    ...(wire.size === undefined ? {} : { size: wire.size }),
    ...(wire.modifiedAt === undefined ? {} : { modifiedAt: wire.modifiedAt }),
    ...(wire.mimeType === undefined ? {} : { mimeType: wire.mimeType }),
  };
}

function base64FromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
