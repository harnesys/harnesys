import { Injectable } from '@harnesys/brix';
import type { ContentStat, ContentTreeResult, ProxyRequest } from '@harnesys/contracts';
import {
  ContentHostNotLocalException,
  ContentProxyException,
  HostOfflineException,
} from '../../domain/content/content.error.ts';
import {
  type ContentDownload,
  type ContentReadResult,
  type ContentWriteResult,
  OrgContentPort,
} from '../../domain/content/org-content.port.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { LocalFsContentAdapter } from './local-fs.adapter.ts';
import { throwFromProxyBody } from './proxy-error.ts';
import {
  contentRouteTarget,
  findSourceForContentRoute,
  readyContentHostIds,
} from './routing-content.route.ts';
import { WORKER_CONTENT_PATH, type WorkerContentRequest } from './worker-content.protocol.ts';

@Injectable()
export class RoutingContentAdapter extends OrgContentPort {
  constructor(
    private readonly local: LocalFsContentAdapter,
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly proxy: FleetContentProxyPort,
    private readonly replica: OrgExecutionReplicaPort,
  ) {
    super();
  }

  listTree(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentTreeResult> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.listTree(orgId, sourceId, relPath, worktreeId);
      }
      return this.proxyJson<ContentTreeResult>(ctx.hostId, {
        op: 'tree',
        sourceId,
        relPath,
        ...(worktreeId ? { worktreeId } : {}),
      });
    });
  }

  read(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentReadResult> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.read(orgId, sourceId, relPath, worktreeId);
      }
      return this.proxyJson<{
        bytesBase64: string;
        etag: string;
        size: number;
        mtime: string;
      }>(ctx.hostId, { op: 'read', sourceId, relPath, ...(worktreeId ? { worktreeId } : {}) }).then(
        (body) => ({
          bytes: Uint8Array.from(Buffer.from(body.bytesBase64, 'base64')),
          etag: body.etag,
          size: body.size,
          mtime: body.mtime,
        }),
      );
    });
  }

  write(
    orgId: string,
    sourceId: string,
    relPath: string,
    bytes: Uint8Array,
    options?: { ifMatch?: string | null; worktreeId?: string },
  ): Promise<ContentWriteResult> {
    const ifMatch = options?.ifMatch;
    const worktreeId = options?.worktreeId;
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.write(orgId, sourceId, relPath, bytes, options);
      }
      return this.proxyJson<ContentWriteResult>(ctx.hostId, {
        op: 'write',
        sourceId,
        relPath,
        bytesBase64: Buffer.from(bytes).toString('base64'),
        ifMatch: ifMatch ?? null,
        ...(worktreeId ? { worktreeId } : {}),
      });
    });
  }

  mkdir(orgId: string, sourceId: string, relPath: string, worktreeId?: string): Promise<void> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.mkdir(orgId, sourceId, relPath, worktreeId);
      }
      return this.proxyJson(ctx.hostId, {
        op: 'mkdir',
        sourceId,
        relPath,
        ...(worktreeId ? { worktreeId } : {}),
      }).then(() => undefined);
    });
  }

  remove(orgId: string, sourceId: string, relPath: string, worktreeId?: string): Promise<void> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.remove(orgId, sourceId, relPath, worktreeId);
      }
      return this.proxyJson(ctx.hostId, {
        op: 'remove',
        sourceId,
        relPath,
        ...(worktreeId ? { worktreeId } : {}),
      }).then(() => undefined);
    });
  }

  move(
    orgId: string,
    sourceId: string,
    fromRel: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.move(orgId, sourceId, fromRel, toRel, worktreeId);
      }
      return this.proxyJson(ctx.hostId, {
        op: 'move',
        sourceId,
        relPath: fromRel,
        relPathTo: toRel,
        ...(worktreeId ? { worktreeId } : {}),
      }).then(() => undefined);
    });
  }

  copy(
    orgId: string,
    sourceId: string,
    fromRel: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.copy(orgId, sourceId, fromRel, toRel, worktreeId);
      }
      return this.proxyJson(ctx.hostId, {
        op: 'copy',
        sourceId,
        relPath: fromRel,
        relPathTo: toRel,
        ...(worktreeId ? { worktreeId } : {}),
      }).then(() => undefined);
    });
  }

  importPaths(
    orgId: string,
    sourceId: string,
    fromAbs: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void> {
    return this.route(orgId, sourceId, (ctx) => {
      if (ctx.remote) {
        return Promise.reject(new ContentHostNotLocalException(ctx.hostId));
      }
      return this.local.importPaths(orgId, sourceId, fromAbs, toRel, worktreeId);
    });
  }

  stat(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentStat> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.stat(orgId, sourceId, relPath, worktreeId);
      }
      return this.proxyJson<ContentStat>(ctx.hostId, {
        op: 'stat',
        sourceId,
        relPath,
        ...(worktreeId ? { worktreeId } : {}),
      });
    });
  }

  duplicate(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentStat> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.duplicate(orgId, sourceId, relPath, worktreeId);
      }
      return this.proxyJson<ContentStat>(ctx.hostId, {
        op: 'duplicate',
        sourceId,
        relPath,
        ...(worktreeId ? { worktreeId } : {}),
      });
    });
  }

  reveal(orgId: string, sourceId: string, relPath: string, worktreeId?: string): Promise<void> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.reveal(orgId, sourceId, relPath, worktreeId);
      }
      return this.proxyJson(ctx.hostId, {
        op: 'reveal',
        sourceId,
        relPath,
        ...(worktreeId ? { worktreeId } : {}),
      }).then(() => undefined);
    });
  }

  download(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentDownload> {
    return this.route(orgId, sourceId, (ctx) => {
      if (!ctx.remote) {
        return this.local.download(orgId, sourceId, relPath, worktreeId);
      }
      return this.proxyJson<{ name: string; bytesBase64: string }>(ctx.hostId, {
        op: 'download',
        sourceId,
        relPath,
        ...(worktreeId ? { worktreeId } : {}),
      }).then((body) => ({
        name: body.name,
        bytes: Uint8Array.from(Buffer.from(body.bytesBase64, 'base64')),
      }));
    });
  }

  private route<T>(
    orgId: string,
    sourceId: string,
    run: (ctx: { hostId: string; remote: boolean }) => Promise<T>,
  ): Promise<T> {
    const source = findSourceForContentRoute({
      orgId,
      sourceId,
      local: this.sources.findById(orgId, sourceId),
      snapshot: this.replica.get(orgId),
    });
    if (!source) {
      return Promise.reject(new SourceNotFoundException(sourceId));
    }
    const localHostId = this.machineConfig.get().id;
    const localMat = this.materializations.find(orgId, sourceId, localHostId);
    const readyHostIds = readyContentHostIds({
      localHostId,
      localReady: localMat?.state === 'ready',
      projectionReadyHostIds: this.materializations
        .listProjectionsForSource(orgId, sourceId)
        .filter((row) => row.state === 'ready')
        .map((row) => row.hostId),
      materializationReadyHostIds: this.materializations
        .listForSource(orgId, sourceId)
        .filter((row) => row.state === 'ready')
        .map((row) => row.hostId),
    });
    return run(
      contentRouteTarget({
        localHostId,
        distribution: source.distribution,
        readyHostIds,
      }),
    );
  }

  private async proxyJson<T>(hostId: string, req: WorkerContentRequest): Promise<T> {
    const request: ProxyRequest = {
      method: 'POST',
      path: WORKER_CONTENT_PATH,
      body: JSON.stringify(req),
      contentType: 'application/json',
    };
    let response: Response;
    try {
      response = await this.proxy.requestProxy(hostId, request);
    } catch (err) {
      if (err instanceof HostOfflineException) {
        throw err;
      }
      throw new ContentProxyException(
        502,
        'PROXY_FAILED',
        err instanceof Error ? err.message : 'proxy failed',
      );
    }
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
      throwFromProxyBody(hostId, response.status, parsed);
    }
    return parsed as T;
  }
}
