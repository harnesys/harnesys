export interface HostDirectoryEntry {
  name: string;
  path: string;
}

export interface HostDirectoryListing {
  path: string;
  parent: string | null;
  entries: HostDirectoryEntry[];
}
