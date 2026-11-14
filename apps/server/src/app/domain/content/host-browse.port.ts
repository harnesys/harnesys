import type { HostDirectoryListing } from './host-directory.ts';

export abstract class HostBrowsePort {
  abstract listHostDirectories(path?: string): HostDirectoryListing;
}
