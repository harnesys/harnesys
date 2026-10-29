import { apiJson } from './client';

export interface HostDirectoryEntry {
  name: string;
  path: string;
}

export interface HostDirectoryListing {
  path: string;
  parent: string | null;
  entries: HostDirectoryEntry[];
}

export interface BrowseDirsInput {
  path?: string;
  hostId?: string;
}

export interface CreateDirInput {
  path: string;
  hostId?: string;
}

export interface HostDirCreated {
  absolutePath: string;
}

export function browseDirs(
  orgId: string,
  input: BrowseDirsInput = {},
): Promise<HostDirectoryListing> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/browse-dirs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createDir(orgId: string, input: CreateDirInput): Promise<HostDirCreated> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/create-dir`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
