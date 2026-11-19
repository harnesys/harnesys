import { Database } from 'bun:sqlite';
import type { ModelQuotaPort, ModelRateLimits, QuotaAdmission } from 'harnesys';
import {
  admitQuota,
  emptyQuotaState,
  type QuotaBucketState,
  type QuotaKeyState,
  type QuotaState,
  settleQuota,
} from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { CREATE_MODEL_QUOTA_WINDOWS_SQL } from '../org-sqlite/org-sql.ts';
import { configureOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';

const LOAD_WINDOWS_SQL =
  'SELECT bucket, window_start, requests, tokens FROM model_quota_windows WHERE model_key = ?';

const UPSERT_WINDOW_SQL = `
INSERT INTO model_quota_windows
  (model_key, bucket, window_start, requests, tokens, reserved_requests, reserved_tokens)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(model_key, bucket) DO UPDATE SET
  window_start = excluded.window_start,
  requests = excluded.requests,
  tokens = excluded.tokens,
  reserved_requests = excluded.reserved_requests,
  reserved_tokens = excluded.reserved_tokens
`;

interface WindowRow {
  bucket: string;
  window_start: number;
  requests: number;
  tokens: number;
}

export class SqliteModelQuota implements ModelQuotaPort {
  private readonly sqlite: Database;
  private readonly state: QuotaState = emptyQuotaState();
  private readonly loadedKeys = new Set<string>();
  private seq = 0;

  constructor(
    private readonly orgId: string,
    layout: HostFsLayoutPort,
  ) {
    this.sqlite = new Database(layout.orgDbPath(this.orgId), { create: true });
    configureOrgSqlite(this.sqlite);
    this.sqlite.exec(CREATE_MODEL_QUOTA_WINDOWS_SQL);
  }

  admit(key: string, limits: ModelRateLimits, estTokens: number): QuotaAdmission {
    this.ensureLoaded(key);
    this.seq += 1;
    const admission = admitQuota(
      {
        state: this.state,
        key,
        limits,
        estTokens,
        reservationId: `${this.orgId}-quota-${this.seq}`,
      },
      Date.now(),
    );
    this.persistKey(key);
    return admission;
  }

  settle(key: string, reservation: string, actualTokens: number | undefined): void {
    this.ensureLoaded(key);
    settleQuota(this.state, key, reservation, actualTokens, Date.now());
    this.persistKey(key);
  }

  close(): void {
    this.sqlite.close();
  }

  private ensureLoaded(key: string): void {
    if (this.loadedKeys.has(key)) {
      return;
    }
    const rows = this.sqlite.query(LOAD_WINDOWS_SQL).all(key) as WindowRow[];
    const keyState: QuotaKeyState = { buckets: new Map(), reservations: new Map() };
    for (const row of rows) {
      const bucket: QuotaBucketState = {
        windowStartMs: row.window_start,
        requests: row.requests,
        tokens: row.tokens,
        reservedRequests: 0,
        reservedTokens: 0,
      };
      keyState.buckets.set(row.bucket as 'rpm' | 'rpd' | 'tpm' | 'tpd', bucket);
    }
    this.state.keys.set(key, keyState);
    this.loadedKeys.add(key);
  }

  private persistKey(key: string): void {
    const keyState = this.state.keys.get(key);
    if (keyState === undefined) {
      return;
    }
    const upsert = this.sqlite.prepare(UPSERT_WINDOW_SQL);
    this.sqlite.transaction(() => {
      for (const [bucket, state] of keyState.buckets) {
        upsert.run(
          key,
          bucket,
          state.windowStartMs,
          state.requests,
          state.tokens,
          state.reservedRequests,
          state.reservedTokens,
        );
      }
    })();
  }
}
