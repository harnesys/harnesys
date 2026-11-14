import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import {
  AccountNotFoundException,
  AppNotFoundException,
  AppsException,
  ProviderError,
} from '../../../domain/apps/errors.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { InboundEventPort } from '../../../domain/apps/ports/inbound-event.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type {
  AccountEffect,
  AccountKindModule,
  AccountRef,
  AppKindModule,
  InboundEvent,
  SecretReader,
  WebhookHandler,
  WebhookOutcome,
} from '../../../domain/apps/provider-module.ts';
import type { AccountRecord, AppRecord } from '../../../domain/apps/records.ts';
import { MetricsPort } from '../../../domain/metrics/metrics.port.ts';
import { statusForError } from '../access/status-map.ts';
import { withTimeout } from '../shared/concurrency.ts';
import { createdProviderLogger } from '../shared/provider-context.ts';
import { isoNow } from '../shared/record-views.ts';
import { WebhookRateLimiter } from './webhook-rate-limit.ts';

const MAX_BODY_BYTES = 1024 * 1024;
const HANDLE_TIMEOUT_MS = 2_000;
const DEDUPE_TTL_MS = 10 * 60_000;
const DEDUPE_CAPACITY = 1_000;

export interface WebhookRequestInput {
  orgId: string;
  target: 'app' | 'account';
  targetId: string;
  method: string;
  ip: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: Uint8Array;
}

export interface WebhookResult {
  response: { status: number; body?: string; contentType?: string };
  deferred: Promise<void>;
}

interface ResolvedTarget {
  app: AppRecord | null;
  account: AccountRecord | null;
  handler: WebhookHandler;
  module: AccountKindModule | AppKindModule;
  secrets: SecretReader;
}

interface DedupeEntry {
  at: number;
}

@Injectable()
export class HandleWebhookUseCase {
  private readonly limiter = new WebhookRateLimiter();
  private readonly seen = new Map<string, DedupeEntry>();
  private readonly logger: Logger;

  constructor(
    private readonly apps: AppRepositoryPort,
    private readonly accounts: AccountRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly secrets: SecretScopePort,
    private readonly inbound: InboundEventPort,
    private readonly clock: ClockPort,
    private readonly events: AccountEventPort,
    private readonly metrics: MetricsPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-webhook');
  }

  async execute(request: WebhookRequestInput): Promise<WebhookResult> {
    if (
      !this.limiter.take(`${request.ip}:${request.target}:${request.targetId}`, this.clock.now())
    ) {
      throw new AppsException('rate_limited', 429, 'Too many webhook requests');
    }
    if (request.body.byteLength > MAX_BODY_BYTES) {
      throw new AppsException('too_large', 413, 'Webhook body is too large');
    }
    const target = this.resolve(request);
    try {
      const outcome = await withTimeout(
        target.handler.handle({
          now: () => this.clock.now(),
          log: createdProviderLogger(this.logger, []),
          target:
            request.target === 'app' && target.app
              ? { type: 'app', app: target.app }
              : {
                  type: 'account',
                  account: target.account as AccountRecord,
                  app: target.app,
                },
          secrets: target.secrets,
          request: {
            method: request.method,
            headers: request.headers,
            query: request.query,
            body: request.body,
          },
        }),
        HANDLE_TIMEOUT_MS,
      );
      this.metrics.increment('apps_webhook_total', {
        provider: target.module.descriptor.provider,
        kind: target.module.descriptor.kind,
        outcome: 'ok',
      });
      return {
        response: outcome.response,
        deferred: this.after(request, target, outcome),
      };
    } catch (error) {
      throw this.mapError(error, target);
    }
  }

  private async after(
    request: WebhookRequestInput,
    target: ResolvedTarget,
    outcome: WebhookOutcome,
  ): Promise<void> {
    try {
      await this.applyEffects(request.orgId, target, outcome.effects ?? []);
      await this.publishEvents(request, target, outcome.events ?? []);
    } catch (error) {
      this.logger.warn({ targetId: request.targetId }, 'webhook post-processing failed');
      void error;
    }
  }

  private async applyEffects(
    orgId: string,
    target: ResolvedTarget,
    effects: AccountEffect[],
  ): Promise<void> {
    for (const effect of effects) {
      const account = this.accounts.findByIdentity(orgId, {
        kind: effect.account.kind,
        externalAccountId: effect.account.externalAccountId,
        partition: effect.account.partition ?? '',
      });
      if (!account) {
        continue;
      }
      const status = statusForError(effect.error);
      if (!status) {
        continue;
      }
      this.accounts.update(orgId, account.id, {
        status,
        lastError: effect.error,
        updatedAt: isoNow(this.clock.now()),
      });
      this.events.publish({
        type: 'account.status_changed',
        orgId,
        appId: account.appId,
        accountId: account.id,
        kind: account.kind,
        status,
      });
    }
    void target;
  }

  private async publishEvents(
    request: WebhookRequestInput,
    target: ResolvedTarget,
    events: InboundEvent[],
  ): Promise<void> {
    for (const event of events) {
      const key = `${request.orgId}:${request.target}:${request.targetId}:${event.deliveryId}`;
      if (this.isDuplicate(key)) {
        continue;
      }
      const accountId = this.resolveEventAccount(request, target, event.account);
      if (event.account && !accountId) {
        this.metrics.increment('apps_webhook_total', {
          provider: target.module.descriptor.provider,
          kind: target.module.descriptor.kind,
          outcome: 'not_found',
        });
        continue;
      }
      await this.inbound.publish(request.orgId, {
        orgId: request.orgId,
        appId: target.app?.id ?? null,
        accountId,
        kind: target.module.descriptor.kind,
        event,
      });
    }
  }

  private resolveEventAccount(
    request: WebhookRequestInput,
    target: ResolvedTarget,
    ref: AccountRef | undefined,
  ): string | null {
    if (request.target === 'account') {
      return target.account?.id ?? null;
    }
    if (!ref) {
      return null;
    }
    const account = this.accounts.findByIdentity(request.orgId, {
      kind: ref.kind,
      externalAccountId: ref.externalAccountId,
      partition: ref.partition ?? '',
    });
    return account?.id ?? null;
  }

  private isDuplicate(key: string): boolean {
    const now = this.clock.now();
    const seen = this.seen.get(key);
    if (seen && now - seen.at < DEDUPE_TTL_MS) {
      return true;
    }
    this.seen.set(key, { at: now });
    if (this.seen.size > DEDUPE_CAPACITY) {
      for (const [entryKey, entry] of this.seen) {
        if (now - entry.at > DEDUPE_TTL_MS) {
          this.seen.delete(entryKey);
        }
      }
    }
    return false;
  }

  private resolve(request: WebhookRequestInput): ResolvedTarget {
    if (request.target === 'app') {
      return this.resolveApp(request.orgId, request.targetId);
    }
    return this.resolveAccount(request.orgId, request.targetId);
  }

  private resolveApp(orgId: string, appId: string): ResolvedTarget {
    const app = this.apps.findById(orgId, appId);
    if (!app) {
      throw new AppNotFoundException(appId);
    }
    const module = this.registry.appKind(app.kind);
    if (!module?.webhook) {
      throw new AppsException('not_found', 404, 'Not found');
    }
    return {
      app,
      account: null,
      handler: module.webhook,
      module,
      secrets: this.secrets.reader(orgId, { type: 'app', id: app.id }, module.secrets),
    };
  }

  private resolveAccount(orgId: string, accountId: string): ResolvedTarget {
    const account = this.accounts.findById(orgId, accountId);
    if (!account) {
      throw new AccountNotFoundException(accountId);
    }
    const module = this.registry.accountKind(account.kind);
    if (!module?.webhook) {
      throw new AppsException('not_found', 404, 'Not found');
    }
    const app = account.appId ? this.apps.findById(orgId, account.appId) : null;
    const appModule = app ? this.registry.appKind(app.kind) : null;
    const allowed = [...module.secrets, ...(appModule?.secrets ?? [])];
    const accountSecretKeys = new Set(module.secrets);
    const appSecretKeys = new Set(appModule?.secrets ?? []);
    return {
      app,
      account,
      handler: module.webhook,
      module,
      secrets: {
        get: async (key) => {
          if (accountSecretKeys.has(key)) {
            return this.secrets
              .reader(orgId, { type: 'account', id: account.id }, allowed)
              .get(key);
          }
          if (app && appSecretKeys.has(key)) {
            return this.secrets.reader(orgId, { type: 'app', id: app.id }, allowed).get(key);
          }
          throw new Error(`Secret ${key} is not declared for this target`);
        },
        require: async (key) => {
          if (accountSecretKeys.has(key)) {
            return this.secrets
              .reader(orgId, { type: 'account', id: account.id }, allowed)
              .require(key);
          }
          if (app && appSecretKeys.has(key)) {
            return this.secrets.reader(orgId, { type: 'app', id: app.id }, allowed).require(key);
          }
          throw new Error(`Secret ${key} is not declared for this target`);
        },
      },
    };
  }

  private mapError(error: unknown, target: ResolvedTarget): Error {
    const code: AccountErrorCode = error instanceof ProviderError ? error.code : 'unknown';
    this.metrics.increment('apps_webhook_total', {
      provider: target.module.descriptor.provider,
      kind: target.module.descriptor.kind,
      outcome: code,
    });
    if (code === 'invalid_signature') {
      return new AppsException('invalid_signature', 401, 'Invalid signature');
    }
    if (code === 'invalid_input') {
      return new AppsException('invalid_input', 400, 'Invalid webhook payload');
    }
    return new AppsException('provider_unavailable', 503, 'Provider unavailable');
  }
}
