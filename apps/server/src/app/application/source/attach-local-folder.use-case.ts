import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { ForbiddenException, Injectable } from '@harnesys/brix';
import type { ProxyRequest, Source, SourceVcs, UiVisibility } from '@harnesys/contracts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type NodePrincipal } from '../../domain/identity/principal.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { decideSourceVcsUpdate } from '../../domain/source/decide-source-vcs.ts';
import type { VcsProbeRaw } from '../../domain/source/git-vcs.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { WORKER_CONTENT_PATH } from '../../infra/content/worker-content.protocol.ts';
import { hashNodeToken } from '../fleet/hash-node-token.ts';
import { toPublicSource } from './to-public-source.ts';

export interface AttachLocalFolderInput {
  orgId: string;
  absolutePath: string;
  name?: string;
  hostId?: string;
  uiVisibility?: UiVisibility;
  callerBearerToken?: string;
}

@Injectable()
export class AttachLocalFolderUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly nodes: NodeRepository,
    private readonly hub: FleetHubPort,
    private readonly proxy: FleetContentProxyPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: AttachLocalFolderInput): Promise<Source> {
    const localHostId = this.machineConfig.get().id;
    const hostId = input.hostId?.trim() || localHostId;
    const { absolutePath, vcs } = await this.resolveTarget(input, hostId, localHostId);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const name = input.name?.trim() || basename(absolutePath) || 'Folder';
    const uiVisibility = input.uiVisibility ?? 'org';
    const record = {
      id,
      orgId: input.orgId,
      name,
      description: null,
      distribution: { kind: 'host-bound' as const, hostId },
      uiVisibility,
      managed: false,
      vcs,
      availability: { hostIds: [] },
      lspJson: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sources.insert(record);
    this.materializations.upsert({
      orgId: input.orgId,
      sourceId: id,
      hostId,
      origin: 'attached',
      localPath: absolutePath,
      state: 'ready',
      revision: 1,
      updatedAt: now,
    });
    this.materializations.upsertProjection({
      orgId: input.orgId,
      sourceId: id,
      hostId,
      state: 'ready',
      revision: 1,
      lastConfirmedAt: now,
      lastErrorCode: null,
      lastConflictPaths: [],
      refreshRequired: false,
    });
    this.pushAttachToWorker({
      orgId: input.orgId,
      sourceId: id,
      hostId,
      localHostId,
      absolutePath,
      revision: 1,
    });
    return toPublicSource(record);
  }

  private pushAttachToWorker(input: {
    orgId: string;
    sourceId: string;
    hostId: string;
    localHostId: string;
    absolutePath: string;
    revision: number;
  }): void {
    if (input.hostId === input.localHostId) {
      return;
    }
    const command: WorkerCommand = {
      type: 'SOURCE_ATTACH',
      operationId: randomUUID(),
      sourceId: input.sourceId,
      localPath: input.absolutePath,
      revision: input.revision,
    };
    this.commands.enqueue(input.orgId, input.hostId, command);
    if (this.hub.hasPeer(input.hostId)) {
      this.hub.routeCommand(input.hostId, command);
    }
  }

  private async resolveTarget(
    input: AttachLocalFolderInput,
    hostId: string,
    localHostId: string,
  ): Promise<{ absolutePath: string; vcs: SourceVcs | null }> {
    if (hostId === localHostId) {
      return this.probeLocalDir(input.absolutePath);
    }
    if (this.callerIsTargetHost(input.orgId, hostId, input.callerBearerToken)) {
      return { absolutePath: resolveAttestedRemotePath(input.absolutePath), vcs: null };
    }
    return this.assertRemoteDir(input.orgId, hostId, input.absolutePath);
  }

  private async probeLocalDir(
    absolutePath: string,
  ): Promise<{ absolutePath: string; vcs: SourceVcs | null }> {
    const resolved = assertLocalDir(absolutePath);
    let probe: VcsProbeRaw | null;
    try {
      probe = await this.git.probe(resolved);
    } catch {
      probe = null;
    }
    const vcs = probe ? (decideSourceVcsUpdate(null, probe) ?? null) : null;
    return { absolutePath: resolved, vcs };
  }

  private callerIsTargetHost(
    orgId: string,
    hostId: string,
    callerBearerToken: string | undefined,
  ): boolean {
    const token = callerBearerToken?.trim();
    if (!token) {
      return false;
    }
    const row = this.nodes.findByTokenHash(orgId, hashNodeToken(token));
    if (!row) {
      return false;
    }
    const principal: NodePrincipal = { kind: 'node', nodeId: row.id, orgId };
    if (!authorize(principal, 'source.materialize')) {
      throw new ForbiddenException('source.materialize action is required for nodes');
    }
    return row.id === hostId;
  }

  private async assertRemoteDir(
    orgId: string,
    hostId: string,
    absolutePath: string,
  ): Promise<{ absolutePath: string; vcs: SourceVcs | null }> {
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
        op: 'assert-dir',
        absolutePath,
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
          : `remote path check failed (${response.status})`;
      throw new SourcePathInvalidException(message);
    }
    const vcs = extractRemoteVcs(parsed);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'absolutePath' in parsed &&
      typeof (parsed as { absolutePath: unknown }).absolutePath === 'string'
    ) {
      return { absolutePath: (parsed as { absolutePath: string }).absolutePath, vcs };
    }
    return { absolutePath: resolve(absolutePath), vcs };
  }
}

function extractRemoteVcs(parsed: unknown): SourceVcs | null {
  const vcs =
    parsed && typeof parsed === 'object' && 'vcs' in parsed
      ? (parsed as { vcs: unknown }).vcs
      : null;
  if (
    vcs &&
    typeof vcs === 'object' &&
    'engine' in vcs &&
    (vcs as { engine: unknown }).engine === 'git'
  ) {
    return vcs as SourceVcs;
  }
  return null;
}

function assertLocalDir(absolutePath: string): string {
  const resolved = resolve(absolutePath);
  if (!existsSync(resolved)) {
    throw new SourcePathInvalidException(`path does not exist: ${resolved}`);
  }
  const st = statSync(resolved);
  if (!st.isDirectory()) {
    throw new SourcePathInvalidException(`path is not a directory: ${resolved}`);
  }
  return resolved;
}

function resolveAttestedRemotePath(absolutePath: string): string {
  const trimmed = absolutePath.trim();
  if (!trimmed.startsWith('/')) {
    throw new SourcePathInvalidException(`path must be absolute: ${absolutePath}`);
  }
  return resolve(trimmed);
}
