import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Configuration, Injectable } from '@harnesys/brix';
import type { AppConfig } from '../../../../config.schema.ts';
import { GithubAppNotConfiguredException } from '../../../domain/integration/integration.error.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { signGithubAppJwt } from './app-jwt.ts';
import { getAppInfo } from './github-api.ts';
import {
  type GithubAppRegistration,
  type GithubAppSettings,
  resolveGithubAppSettings,
} from './github-app-config.ts';

const REGISTRATION_FILE = 'github-app.json';

@Injectable()
export class GithubAppStore {
  constructor(
    private readonly layout: HostFsLayoutPort,
    @Configuration() private readonly config: AppConfig,
  ) {}

  find(): GithubAppSettings | null {
    return resolveGithubAppSettings(this.config.githubApp, this.registered());
  }

  require(): GithubAppSettings {
    const settings = this.find();
    if (!settings) {
      throw new GithubAppNotConfiguredException();
    }
    return settings;
  }

  async findVerified(): Promise<GithubAppSettings | null> {
    const settings = this.find();
    if (!settings) {
      return null;
    }
    try {
      const jwt = signGithubAppJwt({ appId: settings.appId, privateKey: settings.privateKey });
      await getAppInfo(jwt);
      return settings;
    } catch {
      return null;
    }
  }

  registered(): GithubAppRegistration | null {
    const path = this.registrationPath();
    if (!existsSync(path)) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (isRegistration(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  saveRegistration(registration: GithubAppRegistration): void {
    writeFileSync(this.registrationPath(), `${JSON.stringify(registration, null, 2)}\n`, {
      mode: 0o600,
    });
  }

  private registrationPath(): string {
    return join(this.layout.home(), REGISTRATION_FILE);
  }
}

function isRegistration(value: unknown): value is GithubAppRegistration {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.appId === 'string' &&
    typeof record.privateKey === 'string' &&
    typeof record.registeredAt === 'string'
  );
}
