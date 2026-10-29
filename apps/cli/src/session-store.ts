import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface StoredSession {
  relayUrl: string;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
}

const SESSION_FILE = 'session.json';
const SESSION_MODE = 0o600;

export function sessionPath(home: string): string {
  return join(home, SESSION_FILE);
}

export function readSession(home: string): StoredSession | undefined {
  const path = sessionPath(home);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      relayUrl?: unknown;
      accessToken?: unknown;
      accessExpiresAt?: unknown;
      refreshToken?: unknown;
    };
    if (
      typeof parsed.relayUrl !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.accessExpiresAt !== 'string' ||
      typeof parsed.refreshToken !== 'string'
    ) {
      return undefined;
    }
    return {
      relayUrl: parsed.relayUrl,
      accessToken: parsed.accessToken,
      accessExpiresAt: parsed.accessExpiresAt,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return undefined;
  }
}

export function writeSession(home: string, session: StoredSession): void {
  mkdirSync(home, { recursive: true });
  const path = sessionPath(home);
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, { mode: SESSION_MODE });
  chmodSync(path, SESSION_MODE);
}

export function deleteSession(home: string): void {
  const path = sessionPath(home);
  if (existsSync(path)) {
    rmSync(path);
  }
}
