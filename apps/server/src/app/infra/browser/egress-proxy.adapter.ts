import { lookup } from 'node:dns/promises';
import { Injectable, type ModuleDestroyHook } from '@harnesys/brix';
import type { Socket, TCPSocketListener } from 'bun';
import {
  type EgressProxyHandle,
  EgressProxyPort,
  type EgressProxyStartInput,
} from '../../domain/browser/egress-proxy.port.ts';
import {
  hostAllowed,
  isIpLiteral,
  isPrivateAddress,
  normalizeHost,
} from '../../domain/browser/host-allowlist.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';

const TUNNEL_PORT = 443;
const HTTP_PORT = 80;
const HANDSHAKE_LIMIT_BYTES = 64 * 1024;

interface SessionData {
  buffer: string;
  tunneled: boolean;
}

type BunSocket = Socket<SessionData>;
type UpstreamSocket = Socket<unknown>;

interface ProxyEntry {
  orgId: string;
  credentialId: string;
  instance: EgressProxyInstance;
}

@Injectable()
export class EgressProxyAdapter extends EgressProxyPort implements ModuleDestroyHook {
  private readonly sessions = new Map<string, ProxyEntry>();

  constructor(private readonly audit: OrgAudit) {
    super();
  }

  async start(input: EgressProxyStartInput): Promise<EgressProxyHandle> {
    await this.stopScope(input.scopeKey);
    const instance = new EgressProxyInstance(input, this.audit);
    this.sessions.set(input.scopeKey, {
      orgId: input.orgId,
      credentialId: input.credentialId,
      instance,
    });
    return { port: instance.port, stop: () => this.stopScope(input.scopeKey) };
  }

  async releaseForCredential(orgId: string, credentialId: string): Promise<string[]> {
    const released: string[] = [];
    for (const [scopeKey, entry] of this.sessions) {
      if (entry.orgId === orgId && entry.credentialId === credentialId) {
        entry.instance.stop();
        this.sessions.delete(scopeKey);
        released.push(scopeKey);
      }
    }
    return released;
  }

  onModuleDestroy(): void {
    for (const [scopeKey, entry] of this.sessions) {
      entry.instance.stop();
      this.sessions.delete(scopeKey);
    }
  }

  private async stopScope(scopeKey: string): Promise<void> {
    const entry = this.sessions.get(scopeKey);
    if (entry) {
      entry.instance.stop();
      this.sessions.delete(scopeKey);
    }
  }
}

class EgressProxyInstance {
  readonly port: number;
  private readonly server: TCPSocketListener<SessionData>;
  private readonly openSockets = new Set<BunSocket>();
  private readonly forwards = new Map<BunSocket, UpstreamSocket>();
  private stopped = false;

  constructor(
    private readonly input: EgressProxyStartInput,
    private readonly audit: OrgAudit,
  ) {
    this.server = Bun.listen<SessionData>({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open: (socket) => {
          socket.data = { buffer: '', tunneled: false };
        },
        data: (socket, chunk) => this.onSocketData(socket, chunk),
        close: (socket) => {
          this.openSockets.delete(socket);
          this.forwards.get(socket)?.end();
          this.forwards.delete(socket);
        },
        error: (socket) => {
          this.openSockets.delete(socket);
          this.forwards.get(socket)?.end();
          this.forwards.delete(socket);
          socket.end();
        },
      },
    });
    this.port = this.server.port ?? 0;
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    for (const socket of this.openSockets) {
      socket.end();
    }
    this.openSockets.clear();
    for (const upstream of this.forwards.values()) {
      upstream.end();
    }
    this.forwards.clear();
    this.server.stop(true);
  }

  private onSocketData(socket: BunSocket, chunk: Uint8Array): void {
    if (socket.data.tunneled) {
      this.forwards.get(socket)?.write(chunk);
      return;
    }
    socket.data.buffer += new TextDecoder().decode(chunk);
    const end = socket.data.buffer.indexOf('\r\n\r\n');
    if (end === -1) {
      if (socket.data.buffer.length > HANDSHAKE_LIMIT_BYTES) {
        socket.end();
      }
      return;
    }
    const head = socket.data.buffer.slice(0, end);
    const rest = socket.data.buffer.slice(end + 4);
    socket.data.buffer = '';
    const requestLine = head.split('\r\n')[0] ?? '';
    void this.dispatch(socket, requestLine, rest);
  }

  private async dispatch(socket: BunSocket, requestLine: string, rest: string): Promise<void> {
    const connectMatch = requestLine.match(/^CONNECT\s+(\S+)\s+HTTP\/1\.[01]$/i);
    if (connectMatch?.[1] !== undefined) {
      await this.handleConnect(socket, connectMatch[1], rest);
      return;
    }
    const absoluteMatch = requestLine.match(/^[A-Z]+\s+(https?:\/\/\S+)\s+HTTP\/1\.[01]$/i);
    if (absoluteMatch?.[1] !== undefined) {
      await this.handlePlainHttp(socket, absoluteMatch[1], rest);
      return;
    }
    this.deny(socket, 'bad-request-line', 0);
  }

  private async handleConnect(socket: BunSocket, authority: string, rest: string): Promise<void> {
    const separator = authority.lastIndexOf(':');
    if (separator === -1) {
      this.deny(socket, authority, 0);
      return;
    }
    const host = normalizeHost(authority.slice(0, separator).replace(/^\[/, '').replace(/\]$/, ''));
    const port = Number.parseInt(authority.slice(separator + 1), 10);
    if (port !== TUNNEL_PORT) {
      this.deny(socket, host, port);
      return;
    }
    if (!hostAllowed(host, this.input.hosts)) {
      this.deny(socket, host, port);
      return;
    }
    await this.tunnel(socket, host, port, rest, true);
  }

  private async handlePlainHttp(socket: BunSocket, rawUrl: string, rest: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      this.deny(socket, rawUrl, 0);
      return;
    }
    const host = normalizeHost(parsed.hostname);
    const port = parsed.port === '' ? HTTP_PORT : Number.parseInt(parsed.port, 10);
    if (parsed.protocol !== 'http:' || port !== HTTP_PORT) {
      this.deny(socket, host, port);
      return;
    }
    if (!hostAllowed(host, this.input.hosts)) {
      this.deny(socket, host, port);
      return;
    }
    await this.tunnel(socket, host, port, rest, false);
  }

  private async tunnel(
    socket: BunSocket,
    host: string,
    port: number,
    rest: string,
    isConnect: boolean,
  ): Promise<void> {
    const addresses = await this.resolveSafe(host);
    if (!addresses) {
      this.deny(socket, host, port);
      return;
    }
    const pinned = addresses[0];
    if (pinned === undefined || isPrivateAddress(pinned)) {
      this.deny(socket, host, port);
      return;
    }
    this.appendAudit(`${host}:${port}`, 'ok');
    let upstream: UpstreamSocket;
    try {
      upstream = await Bun.connect({
        hostname: pinned,
        port,
        socket: {
          data: (_upstream, chunk) => {
            socket.write(chunk);
          },
          close: () => {
            socket.end();
          },
          error: () => {
            socket.end();
          },
        },
      });
    } catch {
      this.appendAudit(`${host}:${port}`, 'failed');
      socket.end();
      return;
    }
    socket.data.tunneled = true;
    this.openSockets.add(socket);
    this.forwards.set(socket, upstream);
    if (isConnect) {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    }
    if (rest.length > 0) {
      upstream.write(rest);
    }
  }

  private async resolveSafe(host: string): Promise<string[] | null> {
    if (isIpLiteral(host)) {
      return hostAllowed(host, this.input.hosts) ? [host] : null;
    }
    try {
      const found = await lookup(host, { all: true });
      if (found.length === 0) {
        return null;
      }
      if (found.some((entry) => isPrivateAddress(entry.address))) {
        return null;
      }
      return found.map((entry) => entry.address);
    } catch {
      return null;
    }
  }

  private deny(socket: BunSocket, resource: string, port: number): void {
    this.appendAudit(port > 0 ? `${resource}:${port}` : resource, 'denied');
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.end();
  }

  private appendAudit(resource: string, result: 'ok' | 'denied' | 'failed'): void {
    this.audit.append(this.input.orgId, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorKind: 'system',
      actorId: `browser-egress:${this.input.scopeKey}`,
      viaNodeId: null,
      action: 'browser.egress',
      resource: `${this.input.credentialId}/${resource}`,
      result,
    });
  }
}
