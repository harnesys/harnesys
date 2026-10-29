import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { ProxyRequest } from '@harnesys/contracts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { WORKER_CONTENT_PATH } from '../../infra/content/worker-content.protocol.ts';

export interface CreateHostDirInput {
  orgId: string;
  hostId?: string;
  path: string;
}

export interface CreateHostDirResult {
  absolutePath: string;
}

@Injectable()
export class CreateHostDirUseCase {
  constructor(
    private readonly machineConfig: MachineConfigPort,
    private readonly nodes: NodeRepository,
    private readonly hub: FleetHubPort,
    private readonly proxy: FleetContentProxyPort,
  ) {}

  async execute(input: CreateHostDirInput): Promise<CreateHostDirResult> {
    const path = input.path.trim();
    if (path.length === 0) {
      throw new SourcePathInvalidException('path is required');
    }
    const localHostId = this.machineConfig.get().id;
    const hostId = input.hostId?.trim() || localHostId;
    if (hostId === localHostId) {
      return createLocalDirectory(path);
    }
    return this.createRemote(input.orgId, hostId, path);
  }

  private async createRemote(
    orgId: string,
    hostId: string,
    path: string,
  ): Promise<CreateHostDirResult> {
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
        op: 'mkdir-dir',
        absolutePath: path,
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
          : `remote directory creation failed (${response.status})`;
      throw new SourcePathInvalidException(message);
    }
    if (!isCreatedDirPayload(parsed)) {
      throw new SourcePathInvalidException('remote directory creation returned invalid payload');
    }
    return parsed;
  }
}

function createLocalDirectory(path: string): CreateHostDirResult {
  const resolved = resolve(expandHome(path));
  try {
    mkdirSync(resolved, { recursive: true });
  } catch {
    throw new SourcePathInvalidException(`cannot create directory: ${resolved}`);
  }
  return { absolutePath: resolved };
}

function expandHome(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function isCreatedDirPayload(value: unknown): value is CreateHostDirResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.absolutePath === 'string' && row.absolutePath.length > 0;
}
