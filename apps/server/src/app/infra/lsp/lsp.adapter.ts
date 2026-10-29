import { join } from 'node:path';
import { Injectable, ValidationException } from '@harnesys/brix';
import type { LspServerSpec } from 'harnesys';
import {
  type LspDiagnostic,
  type LspDiagnosticsRequest,
  type LspHover,
  type LspLocation,
  LspPort,
  type LspPositionRequest,
} from '../../domain/lsp/lsp.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { toDiagnostic } from './lsp-messages.ts';
import { readOrgLspFile } from './org-lsp-file.ts';
import {
  extensionOwnerMap,
  type ResolvedLspServer,
  resolveLspServers,
} from './server-resolution.ts';
import { StdioLspSession } from './stdio-lsp-session.ts';

export interface OrgDiagnosticsFrame {
  orgId: string;
  cwd: string;
  serverId: string;
  diagnostics: LspDiagnostic[];
}

const DEFAULT_MAX_RESTARTS = 3;
const NO_SERVER_PREFIX = 'no lsp server';

export function noLspServerError(ext: string): ValidationException {
  return new ValidationException(`${NO_SERVER_PREFIX} for ${ext}`);
}

interface SessionSlot {
  session: StdioLspSession;
  restarts: number;
}

@Injectable()
export class LspAdapter extends LspPort {
  private readonly orgs = new Map<string, Map<string, SessionSlot>>();
  private readonly listeners = new Set<(frame: OrgDiagnosticsFrame) => void>();

  constructor(
    private readonly runtime: PluginRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly layout: HostFsLayoutPort,
  ) {
    super();
  }

  override async diagnostics(
    orgId: string,
    request: LspDiagnosticsRequest,
  ): Promise<LspDiagnostic[]> {
    const { session } = await this.slot(orgId, request.cwd, request.roots ?? [], request.path);
    return session.diagnostics(request.path);
  }

  override async definition(orgId: string, request: LspPositionRequest): Promise<LspLocation[]> {
    const { session } = await this.slot(orgId, request.cwd, request.roots ?? [], request.path);
    return session.definition(request.path, request.line, request.character);
  }

  override async references(orgId: string, request: LspPositionRequest): Promise<LspLocation[]> {
    const { session } = await this.slot(orgId, request.cwd, request.roots ?? [], request.path);
    return session.references(request.path, request.line, request.character);
  }

  override async hover(orgId: string, request: LspPositionRequest): Promise<LspHover | null> {
    const { session } = await this.slot(orgId, request.cwd, request.roots ?? [], request.path);
    return session.hover(request.path, request.line, request.character);
  }

  override invalidateOrg(orgId: string): void {
    const slots = this.orgs.get(orgId);
    if (slots === undefined) {
      return;
    }
    this.orgs.delete(orgId);
    for (const slot of slots.values()) {
      void slot.session.dispose().catch(() => undefined);
    }
  }

  onDiagnostics(orgId: string, listener: (frame: OrgDiagnosticsFrame) => void): () => void {
    const wrapped = (frame: OrgDiagnosticsFrame): void => {
      if (frame.orgId === orgId) {
        listener(frame);
      }
    };
    this.listeners.add(wrapped);
    return () => {
      this.listeners.delete(wrapped);
    };
  }

  private fanOut(
    orgId: string,
    cwd: string,
    serverId: string,
    message: Record<string, unknown>,
  ): void {
    if (message.method !== 'textDocument/publishDiagnostics') {
      return;
    }
    const params = message.params;
    if (typeof params !== 'object' || params === null) {
      return;
    }
    const record = params as { uri?: unknown; diagnostics?: unknown };
    if (typeof record.uri !== 'string' || !Array.isArray(record.diagnostics)) {
      return;
    }
    const diagnostics = record.diagnostics
      .map((raw) => toDiagnostic(raw, record.uri as string, cwd))
      .filter((item) => item !== undefined);
    if (diagnostics.length === 0) {
      return;
    }
    const frame: OrgDiagnosticsFrame = { orgId, cwd, serverId, diagnostics };
    for (const listener of this.listeners) {
      listener(frame);
    }
  }

  private async slot(
    orgId: string,
    cwd: string,
    roots: string[],
    path: string,
  ): Promise<SessionSlot> {
    const ext = pathExtension(path);
    const server = await this.serverFor(orgId, ext);
    const key = `${cwd}::${server.serverId}::${[...roots].sort().join('|')}`;
    const slots = this.orgs.get(orgId) ?? new Map<string, SessionSlot>();
    this.orgs.set(orgId, slots);
    const existing = slots.get(key);
    if (existing?.session.alive) {
      return existing;
    }
    if (existing !== undefined) {
      slots.delete(key);
    }
    const spec = serverSpec(server);
    const restarts = existing?.restarts ?? 0;
    const maxRestarts =
      spec.restartOnCrash === true ? (spec.maxRestarts ?? DEFAULT_MAX_RESTARTS) : 0;
    if (existing !== undefined && restarts >= maxRestarts) {
      throw new Error(`lsp server "${server.serverId}" exited and restart limit reached`);
    }
    const session = await StdioLspSession.start(spec, cwd, roots);
    const slot: SessionSlot = { session, restarts: existing !== undefined ? restarts + 1 : 0 };
    slots.set(key, slot);
    session.onMessage((message) => this.fanOut(orgId, cwd, server.serverId, message));
    void session.exited
      .then(() => {
        if (slots.get(key) === slot) {
          slots.delete(key);
        }
      })
      .catch(() => undefined);
    return slot;
  }

  private async serverFor(orgId: string, ext: string): Promise<ResolvedLspServer> {
    const owner = extensionOwnerMap(await this.resolveServers(orgId)).get(ext);
    if (owner === undefined) {
      throw noLspServerError(ext);
    }
    return owner;
  }

  private async resolveServers(orgId: string): Promise<ResolvedLspServer[]> {
    const file = readOrgLspFile(this.layout.lspConfigPath(orgId));
    const disabled = new Set(
      this.plugins
        .listDisabledServers(orgId)
        .map((entry) => `plugin:${entry.pluginName}:${entry.serverId}`),
    );
    const bundle = await this.runtime.bundle(orgId);
    return resolveLspServers(
      file.servers,
      bundle.lspServers.filter((entry) => this.isApproved(orgId, entry)),
      disabled,
    );
  }

  private isApproved(orgId: string, entry: { plugin: string; serverId: string }): boolean {
    const rawId = entry.serverId.split(':').slice(2).join(':');
    return this.plugins.approvals(orgId, entry.plugin).includes(rawId);
  }
}

function serverSpec(server: ResolvedLspServer): LspServerSpec {
  const spec = server.spec;
  if (!('transport' in spec) && !('env' in spec) && !('projectFolder' in spec)) {
    return {
      serverId: spec.serverId,
      command: spec.command,
      ...(spec.args !== undefined ? { args: spec.args } : {}),
      extensionToLanguage: spec.extensionToLanguage,
    };
  }
  const full = spec as LspServerSpec;
  if (full.transport === 'socket') {
    throw new Error(`lsp transport "socket" is not supported (server ${server.serverId})`);
  }
  return full;
}

function pathExtension(path: string): string {
  const base = join('', path).split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}
