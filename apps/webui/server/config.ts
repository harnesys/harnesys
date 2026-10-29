import { join } from 'node:path';

export interface WebConfig {
  port: number;
  staticDir: string;
  upstreamOrigin: string;
}

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}

export function loadConfig(): WebConfig {
  return {
    port: Number(firstEnv('HARNESYS_WEB_PORT', 'WEB_PORT') ?? 8080),
    staticDir: firstEnv('HARNESYS_WEB_STATIC', 'STATIC_DIR') ?? join(import.meta.dir, '..', 'dist'),
    upstreamOrigin: firstEnv('HARNESYS_UPSTREAM', 'UPSTREAM') ?? 'http://127.0.0.1:47474',
  };
}
