export interface HostDirectoryEntry {
  name: string;
  path: string;
  kind: 'dir' | 'file';
}

export interface HostDirectoryListing {
  path: string;
  parent: string | null;
  entries: HostDirectoryEntry[];
}
