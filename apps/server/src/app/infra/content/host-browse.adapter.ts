import { Injectable } from '@harnesys/brix';
import { HostBrowsePort } from '../../domain/content/host-browse.port.ts';
import { listHostDirectories } from './list-host-directories.ts';

@Injectable()
export class HostBrowseAdapter extends HostBrowsePort {
  override listHostDirectories(path?: string) {
    return listHostDirectories(path);
  }
}
