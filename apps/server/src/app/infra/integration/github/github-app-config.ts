import type { GithubAppConfig } from '../../../../config.schema.ts';
import { GithubAppNotConfiguredException } from '../../../domain/integration/integration.error.ts';

export interface GithubAppSettings {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  appSlug: string;
  clientId: string;
  clientSecret: string;
}

export interface GithubAppRegistration {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  appSlug: string;
  clientId: string;
  clientSecret: string;
  registeredAt: string;
}

export function toSettings(registration: GithubAppRegistration): GithubAppSettings {
  return {
    appId: registration.appId,
    privateKey: registration.privateKey,
    webhookSecret: registration.webhookSecret,
    appSlug: registration.appSlug,
    clientId: registration.clientId,
    clientSecret: registration.clientSecret,
  };
}

export function resolveGithubAppSettings(
  config: GithubAppConfig,
  registered: GithubAppRegistration | null,
): GithubAppSettings | null {
  try {
    return requireGithubApp(config);
  } catch {
    if (
      registered !== null &&
      registered.appId.trim() !== '' &&
      registered.privateKey.trim() !== ''
    ) {
      return toSettings(registered);
    }
    return null;
  }
}

export function requireGithubApp(config: GithubAppConfig): GithubAppSettings {
  const appId = config.appId.trim();
  const privateKey = config.privateKey.trim().replaceAll('\\n', '\n');
  if (!appId || !privateKey) {
    throw new GithubAppNotConfiguredException();
  }
  return {
    appId,
    privateKey,
    clientId: config.clientId.trim(),
    clientSecret: config.clientSecret.trim(),
    webhookSecret: config.webhookSecret.trim(),
    appSlug: config.appSlug.trim(),
  };
}
