import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function harnesysHome(): string {
  const fromEnv = process.env.HARNESYS_HOME?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }
  return join(homedir(), '.harnesys');
}

export function localOrigin(home: string): string {
  const path = join(home, 'config.json');
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        host?: { publicOrigin?: unknown; listen?: unknown };
      };
      if (typeof parsed.host?.publicOrigin === 'string' && parsed.host.publicOrigin.trim()) {
        return parsed.host.publicOrigin.trim().replace(/\/+$/, '');
      }
      if (typeof parsed.host?.listen === 'string' && parsed.host.listen.trim()) {
        return `http://${parsed.host.listen.trim()}`;
      }
    } catch {
      // fall through
    }
  }
  return 'http://127.0.0.1:47474';
}

export function fail(message: string): never {
  process.stderr.write(`harnesys: ${message}\n`);
  process.exit(1);
}
