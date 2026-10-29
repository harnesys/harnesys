import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { Configuration, Injectable } from '@harnesys/brix';
import type { AppConfig } from '../../../config.schema.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type HostConfig, MachineConfigPort } from '../../domain/machine/machine-config.port.ts';

const FILE_MODE = 0o600;

@Injectable()
export class MachineConfigAdapter extends MachineConfigPort {
  private memoryDefaults: HostConfig | null = null;

  constructor(
    private readonly layout: HostFsLayoutPort,
    @Configuration() private readonly appConfig: AppConfig,
  ) {
    super();
  }

  get(): HostConfig {
    const path = this.layout.configPath();
    if (!existsSync(path)) {
      const created = this.defaults();
      this.persist(created);
      return created;
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
      return this.normalize(raw);
    } catch {
      const created = this.defaults();
      this.persist(created);
      return created;
    }
  }

  set(host: HostConfig): void {
    this.persist(host);
  }

  private defaults(): HostConfig {
    if (this.memoryDefaults) {
      return this.memoryDefaults;
    }
    const host: HostConfig = {
      id: crypto.randomUUID(),
      name: defaultHostName(),
      listen: '127.0.0.1:47474',
      token: crypto.randomUUID(),
    };
    const publicOrigin = this.configuredPublicOrigin();
    if (publicOrigin) {
      host.publicOrigin = publicOrigin;
    }
    this.memoryDefaults = host;
    return this.memoryDefaults;
  }

  private normalize(raw: unknown): HostConfig {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return this.defaults();
    }
    const root = raw as Record<string, unknown>;
    const hostRaw =
      root.host && typeof root.host === 'object' && !Array.isArray(root.host)
        ? (root.host as Record<string, unknown>)
        : root;
    const host: HostConfig = {
      id: readString(hostRaw.id) ?? crypto.randomUUID(),
      name: readString(hostRaw.name) ?? defaultHostName(),
      listen: readString(hostRaw.listen) ?? '127.0.0.1:47474',
      token: readString(hostRaw.token) ?? crypto.randomUUID(),
    };
    const publicOrigin = this.configuredPublicOrigin() ?? readString(hostRaw.publicOrigin);
    if (publicOrigin) {
      host.publicOrigin = publicOrigin;
    }
    this.memoryDefaults = null;
    return host;
  }

  private configuredPublicOrigin(): string | undefined {
    const value = this.appConfig.harnesys.publicUrl.trim();
    return value ? value.replace(/\/+$/, '') : undefined;
  }

  private persist(host: HostConfig): void {
    this.layout.ensureHome();
    const path = this.layout.configPath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const payload = { host };
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: FILE_MODE });
    renameSync(tmp, path);
    chmodSync(path, FILE_MODE);
    this.memoryDefaults = null;
  }
}

function defaultHostName(): string {
  try {
    return hostname() || 'Host';
  } catch {
    return 'Host';
  }
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
