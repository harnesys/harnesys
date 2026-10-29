import { Injectable } from '@harnesys/brix';
import type { ProxyRequest } from '@harnesys/contracts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import type { HostDirectoryListing } from '../../domain/content/host-directory.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { listHostDirectories } from '../../infra/content/list-host-directories.ts';
import { WORKER_CONTENT_PATH } from '../../infra/content/worker-content.protocol.ts';

export interface BrowseHostDirsInput {
  orgId: string;
  hostId?: string;
  path?: string;
}

@Injectable()
export class BrowseHostDirsUseCase {
  constructor(
    private readonly machineConfig: MachineConfigPort,
    private readonly nodes: NodeRepository,
    private readonly hub: FleetHubPort,
    private readonly proxy: FleetContentProxyPort,
  ) {}

  async execute(input: BrowseHostDirsInput): Promise<HostDirectoryListing> {
    const localHostId = this.machineConfig.get().id;
    const hostId = input.hostId?.trim() || localHostId;
    if (hostId === localHostId) {
      return listHostDirectories(input.path);
    }
    return this.browseRemote(input.orgId, hostId, input.path);
  }

  private async browseRemote(
    orgId: string,
    hostId: string,
    path: string | undefined,
  ): Promise<HostDirectoryListing> {
    const node = this.nodes.findById(orgId, hostId);
    if (node?.role !== 'worker') {
      throw new SourcePathInvalidException(`unknown worker host: ${hostId}`);
    }
    if (!this.hub.hasPeer(hostId)) {
      throw new HostOfflineException(hostId);
    }
    const request: ProxyRequest = {
      method: 'POST',
      path: WORKER_CONTENT_PATH,
      body: JSON.stringify({
        op: 'list-dirs',
        absolutePath: path?.trim() ?? '',
      }),
      contentType: 'application/json',
    };
    const response = await this.proxy.requestProxy(hostId, request);
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) {
      const message =
        parsed &&
        typeof parsed === 'object' &&
        'message' in parsed &&
        typeof (parsed as { message: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : `remote directory browse failed (${response.status})`;
      throw new SourcePathInvalidException(message);
    }
    if (!isHostDirectoryListing(parsed)) {
      throw new SourcePathInvalidException('remote directory browse returned invalid payload');
    }
    return parsed;
  }
}

function isHostDirectoryListing(value: unknown): value is HostDirectoryListing {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.path !== 'string') {
    return false;
  }
  if (!(row.parent === null || typeof row.parent === 'string')) {
    return false;
  }
  if (!Array.isArray(row.entries)) {
    return false;
  }
  return row.entries.every((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const item = entry as Record<string, unknown>;
    return typeof item.name === 'string' && typeof item.path === 'string';
  });
}
