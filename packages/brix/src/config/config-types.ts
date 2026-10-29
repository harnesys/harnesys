import type { ZodType } from 'zod';

export interface LoadConfigArgs {
  configDir?: string;
  env?: string;
}

export interface ConfigModuleOptions {
  schema?: ZodType;
  configDir?: string;
  preloadedConfig?: unknown;
}
