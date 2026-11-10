import type { ChildHandle, SpawnedStdio } from '../transport/stdio-wiring.ts';

export type SandboxProfile = 'trusted' | 'restricted';

export interface SandboxSpawnSpec {
  readonly orgId: string;
  readonly addonId: string;
  readonly version: string;
  readonly packageRoot: string;
  readonly command: readonly string[];
  readonly dataDir: string;
  readonly platform: number;
}

export interface SpawnedAddonProcess {
  readonly stdio: SpawnedStdio;
  readonly child: ChildHandle;
}

export abstract class SandboxLauncherPort {
  abstract readonly mechanism: string;
  abstract available(): boolean;
  abstract spawn(spec: SandboxSpawnSpec): Promise<SpawnedAddonProcess>;
}

export const ADDON_ENV_ID = 'HARNESYS_ADDON_ID';
export const ADDON_ENV_DATA_DIR = 'HARNESYS_DATA_DIR';
export const ADDON_ENV_PLATFORM = 'HARNESYS_PLATFORM';

const WHITELISTED_HOST_KEYS: readonly string[] = ['PATH', 'TZ', 'LANG'];

export function whitelistedAddonEnv(spec: SandboxSpawnSpec): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of WHITELISTED_HOST_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value.length > 0) {
      env[key] = value;
    }
  }
  env[ADDON_ENV_ID] = spec.addonId;
  env[ADDON_ENV_DATA_DIR] = spec.dataDir;
  env[ADDON_ENV_PLATFORM] = String(spec.platform);
  return env;
}
