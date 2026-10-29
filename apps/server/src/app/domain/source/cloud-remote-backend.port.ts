export type CloudVendor = 'google' | 'dropbox' | 'onedrive';

export interface CloudRemoteEntry {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  size?: number;
  modifiedAt?: string;
  mimeType?: string;
}

export interface CloudRemoteUploadInput {
  parentId: string;
  name: string;
  content: Uint8Array;
  mimeType?: string;

  fileId?: string;
}

export interface CloudRemoteUploadResult {
  id: string;
  name: string;
  modifiedAt?: string;
}

export interface CloudRemoteFolderInput {
  parentId: string;
  name: string;
}

export interface CloudRemoteFolderResult {
  id: string;
  name: string;
}

export abstract class CloudRemoteBackendPort {
  abstract readonly vendor: CloudVendor;

  abstract listChildren(folderId: string): Promise<CloudRemoteEntry[]>;

  abstract download(fileId: string): Promise<Uint8Array>;

  abstract upload(input: CloudRemoteUploadInput): Promise<CloudRemoteUploadResult>;

  abstract createFolder(input: CloudRemoteFolderInput): Promise<CloudRemoteFolderResult>;

  abstract delete(fileId: string): Promise<void>;

  abstract getMetadata(fileId: string): Promise<CloudRemoteEntry>;
}

export interface CloudDocumentExporter {
  exportDocument(fileId: string, mimeType: string): Promise<Uint8Array>;
}

export function supportsDocumentExport(
  backend: CloudRemoteBackendPort,
): backend is CloudRemoteBackendPort & Partial<CloudDocumentExporter> {
  return typeof (backend as Partial<CloudDocumentExporter>).exportDocument === 'function';
}
