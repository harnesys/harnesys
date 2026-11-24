import { chmodSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Socket, UnixSocketListener } from 'bun';
import type { CredentialMaterial } from '../../domain/browser/credential-resolve.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

export interface CredentialSocketRequest {
  token: string;
  item: string;
}

const PROTOCOL = 'agent-browser.plugin.v1';

export class CredentialSocketChannel {
  private readonly servers = new Map<string, UnixSocketListener<CredentialSession>>();

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly handle: (
      request: CredentialSocketRequest,
    ) => Promise<CredentialMaterial | null>,
  ) {}

  async ensure(orgId: string): Promise<string> {
    if (this.servers.has(orgId)) {
      return this.pathOf(orgId);
    }
    const path = this.pathOf(orgId);
    mkdirSync(join(path, '..'), { recursive: true });
    rmSync(path, { force: true });
    const server = Bun.listen<CredentialSession>({
      unix: path,
      socket: {
        open: (socket) => {
          socket.data = { buffer: '' };
        },
        data: (socket, chunk) => {
          void this.onData(socket, chunk);
        },
        error: (socket) => {
          socket.end();
        },
      },
    });
    chmodSync(path, 0o600);
    this.servers.set(orgId, server);
    return path;
  }

  close(): void {
    for (const server of this.servers.values()) {
      server.stop(true);
    }
    this.servers.clear();
  }

  private pathOf(orgId: string): string {
    return join(this.layout.orgDataDir(orgId), 'browser', 'credential.sock');
  }

  private async onData(socket: Socket<CredentialSession>, chunk: Uint8Array): Promise<void> {
    socket.data.buffer += new TextDecoder().decode(chunk);
    const newline = socket.data.buffer.indexOf('\n');
    if (newline === -1) {
      return;
    }
    const line = socket.data.buffer.slice(0, newline);
    socket.data.buffer = '';
    let request: CredentialSocketRequest | null = null;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === 'object') {
        const row = parsed as Record<string, unknown>;
        const token = row.token;
        const item = row.item;
        if (typeof token === 'string' && typeof item === 'string') {
          request = { token, item };
        }
      }
    } catch {
      request = null;
    }
    const material = request === null ? null : await this.handle(request);
    const response =
      material === null
        ? { protocol: PROTOCOL, success: false }
        : {
            protocol: PROTOCOL,
            success: true,
            credential: {
              username: material.username,
              password: material.password,
              url: material.url,
            },
          };
    socket.write(`${JSON.stringify(response)}\n`);
    socket.end();
  }
}

interface CredentialSession {
  buffer: string;
}
