import { Configuration, Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import type { AppConfig } from '../../../config.schema.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  SecretLockedException,
  SecretValueTooLargeException,
} from '../../domain/secret/secret.error.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { secrets } from '../org-sqlite/secrets.schema.ts';
import { loadOrCreateMasterKey, type SecretKeyMaterial } from './master-key.ts';

const MAX_SECRET_VALUE_BYTES = 64 * 1024;

@Injectable()
export class SecretStoreAdapter extends SecretStorePort {
  private masterKey: SecretKeyMaterial | null = null;
  private readonly masterKeyFromConfig: string;

  constructor(
    private readonly layout: HostFsLayoutPort,
    @Configuration() config: AppConfig,
  ) {
    super();
    this.masterKeyFromConfig = config.harnesys.masterKey;
  }

  async get(orgId: string, key: string): Promise<string | null> {
    const raw = this.requireKey();
    const row = withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(secrets).where(eq(secrets.key, key)).get(),
    );
    if (!row) {
      return null;
    }
    const cryptoKey = await importKey(raw);
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: asBuffer(row.iv), additionalData: Buffer.from(key) },
        cryptoKey,
        concat(asBuffer(row.ciphertext), asBuffer(row.tag)),
      );
      return new TextDecoder().decode(plain);
    } catch {
      throw new SecretLockedException();
    }
  }

  async set(orgId: string, key: string, value: string): Promise<void> {
    if (Buffer.byteLength(value, 'utf8') > MAX_SECRET_VALUE_BYTES) {
      throw new SecretValueTooLargeException(MAX_SECRET_VALUE_BYTES);
    }
    const raw = this.requireKey();
    const cryptoKey = await importKey(raw);
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: Buffer.from(key), tagLength: 128 },
      cryptoKey,
      new TextEncoder().encode(value),
    );
    const bytes = new Uint8Array(data);
    const ciphertext = bytes.slice(0, bytes.length - 16);
    const tag = bytes.slice(bytes.length - 16);
    const now = new Date().toISOString();
    withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db
        .select({ key: secrets.key })
        .from(secrets)
        .where(eq(secrets.key, key))
        .get();
      if (existing) {
        db.update(secrets)
          .set({
            ciphertext: Buffer.from(ciphertext),
            iv: Buffer.from(iv),
            tag: Buffer.from(tag),
            updatedAt: now,
          })
          .where(eq(secrets.key, key))
          .run();
        return;
      }
      db.insert(secrets)
        .values({
          key,
          ciphertext: Buffer.from(ciphertext),
          iv: Buffer.from(iv),
          tag: Buffer.from(tag),
          keyVersion: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
  }

  async delete(orgId: string, key: string): Promise<void> {
    this.requireKey();
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(secrets).where(eq(secrets.key, key)).run();
    });
  }

  async listKeys(orgId: string): Promise<string[]> {
    this.requireKey();
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ key: secrets.key })
        .from(secrets)
        .all()
        .map((row) => row.key),
    );
  }

  private requireKey(): SecretKeyMaterial {
    if (!this.masterKey) {
      this.layout.ensureHome();
      this.masterKey = loadOrCreateMasterKey(this.layout.home(), {
        masterKey: this.masterKeyFromConfig,
      });
    }
    return this.masterKey;
  }
}

function importKey(raw: SecretKeyMaterial): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function asBuffer(value: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(value.length));
  out.set(value);
  return out;
}

function concat(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(a.length + b.length));
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
