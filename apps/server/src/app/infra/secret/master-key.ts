import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SecretLockedException } from '../../domain/secret/secret.error.ts';

export type SecretKeyMaterial = Uint8Array<ArrayBuffer>;

export interface MasterKeyOptions {
  masterKey?: string;
}

export function masterKeyPath(home: string): string {
  return join(home, 'master.key');
}

function decodeKey(raw: string): SecretKeyMaterial {
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) {
    throw new SecretLockedException('Invalid master key length');
  }
  const out = new Uint8Array(new ArrayBuffer(32));
  out.set(bytes);
  return out;
}

export function loadMasterKey(
  home: string,
  options: MasterKeyOptions = {},
): SecretKeyMaterial | null {
  const fromConfig = options.masterKey?.trim();
  if (fromConfig) {
    return decodeKey(fromConfig);
  }
  const path = masterKeyPath(home);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return decodeKey(readFileSync(path, 'utf8').trim());
  } catch {
    return null;
  }
}

export function loadOrCreateMasterKey(
  home: string,
  options: MasterKeyOptions = {},
): SecretKeyMaterial {
  const existing = loadMasterKey(home, options);
  if (existing) {
    return existing;
  }
  const raw = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
  const path = masterKeyPath(home);
  writeFileSync(path, Buffer.from(raw).toString('base64'), { mode: 0o600 });
  chmodSync(path, 0o600);
  return raw;
}
