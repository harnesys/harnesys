import { chmodSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { CREDENTIAL_PLUGIN_SOCKET_FLAG, credentialPluginCommand } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

const PLUGIN_DIR = 'browser-plugins';
const PLUGIN_PREFIX = 'credential-plugin-';
const PLUGIN_MAX_AGE_MS = 10 * 60_000;

@Injectable()
export class VaultPluginMaterializer {
  private readonly paths = new Map<string, string>();

  constructor(private readonly layout: HostFsLayoutPort) {}

  materialize(token: string, socketPath: string): string {
    this.sweep();
    const dir = this.dir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, `${PLUGIN_PREFIX}${token}.sh`);
    const command = credentialPluginCommand(CREDENTIAL_PLUGIN_SOCKET_FLAG, [socketPath, token]);
    const script = `#!/bin/sh\nexec ${command}\n`;
    writeFileSync(path, script, { mode: 0o700 });
    chmodSync(path, 0o700);
    this.paths.set(token, path);
    return path;
  }

  remove(token: string): void {
    const path = this.paths.get(token);
    if (path === undefined) {
      return;
    }
    this.paths.delete(token);
    rmSync(path, { force: true });
  }

  private dir(): string {
    return join(this.layout.home(), 'tools', PLUGIN_DIR);
  }

  private sweep(): void {
    let entries: string[];
    try {
      entries = readdirSync(this.dir());
    } catch {
      return;
    }
    const cutoff = Date.now() - PLUGIN_MAX_AGE_MS;
    for (const name of entries) {
      if (!name.startsWith(PLUGIN_PREFIX)) {
        continue;
      }
      const path = join(this.dir(), name);
      try {
        if (statSync(path).mtimeMs <= cutoff) {
          rmSync(path, { force: true });
        }
      } catch {}
    }
  }
}
