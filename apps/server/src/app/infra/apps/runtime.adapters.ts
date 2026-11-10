import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Configuration, Injectable } from '@harnesys/brix';
import type { AppConfig } from '../../../config.schema.ts';
import type { AccountHolderRef } from '../../domain/apps/errors.ts';
import { type AccountEvent, AccountEventPort } from '../../domain/apps/ports/account-event.port.ts';
import { AccountHolderPort } from '../../domain/apps/ports/account-holder.port.ts';
import { ClockPort } from '../../domain/apps/ports/clock.port.ts';
import {
  type InboundEnvelope,
  InboundEventPort,
} from '../../domain/apps/ports/inbound-event.port.ts';
import { type MetricLabels, MetricsPort } from '../../domain/apps/ports/metrics.port.ts';
import { PublicUrlsPort } from '../../domain/apps/ports/public-urls.port.ts';
import type { SecretTarget } from '../../domain/apps/ports/secret-scope.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

@Injectable()
export class SystemClockAdapter extends ClockPort {
  now(): number {
    return Date.now();
  }
}

@Injectable()
export class PublicUrlsAdapter extends PublicUrlsPort {
  private readonly configured: string;

  constructor(@Configuration() config: AppConfig) {
    super();
    this.configured = config.harnesys.publicUrl.trim();
  }

  baseUrl(): string {
    if (this.configured) {
      return trimSlash(this.configured);
    }
    return `http://127.0.0.1:${process.env.SERVER_PORT ?? process.env.PORT ?? '47473'}`;
  }

  redirectUri(_orgId: string): string {
    return `${this.baseUrl()}/api/apps/oauth/callback`;
  }

  webhookUrl(orgId: string, target: SecretTarget): string {
    const scope = target.type === 'app' ? 'apps' : 'accounts';
    return `${this.baseUrl()}/api/apps/hook/${encodeURIComponent(orgId)}/${scope}/${encodeURIComponent(target.id)}`;
  }

  launchPageUrl(token: string): string {
    return `${this.baseUrl()}/api/apps/connect/launch/${encodeURIComponent(token)}`;
  }

  callbackPath(): string {
    return '/api/apps/oauth/callback';
  }
}

function trimSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class LoggerMetricsAdapter extends MetricsPort {
  private readonly counters = new Map<string, number>();

  increment(name: string, labels: MetricLabels): void {
    this.bump(name, labels);
  }

  observe(name: string, value: number, labels: MetricLabels): void {
    this.bump(name, labels);
    void value;
  }

  snapshot(): Array<{ name: string; labels: MetricLabels; value: number }> {
    return [...this.counters.entries()].map(([key, value]) => {
      const [name, serialized] = key.split('|');
      return { name: name ?? '', labels: JSON.parse(serialized ?? '{}') as MetricLabels, value };
    });
  }

  private bump(name: string, labels: MetricLabels): void {
    const key = `${name}|${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }
}

@Injectable()
export class InProcessAccountEvents extends AccountEventPort {
  private readonly listeners = new Map<string, Set<(event: AccountEvent) => void>>();

  publish(event: AccountEvent): void {
    for (const listener of this.listeners.get(event.orgId) ?? []) {
      listener(event);
    }
  }

  subscribe(orgId: string, handler: (event: AccountEvent) => void): () => void {
    const set = this.listeners.get(orgId) ?? new Set();
    set.add(handler);
    this.listeners.set(orgId, set);
    return () => {
      set.delete(handler);
    };
  }
}

@Injectable()
export class LoggingInboundEvents extends InboundEventPort {
  async publish(_orgId: string, envelope: InboundEnvelope): Promise<void> {
    void envelope;
  }
}

type HolderLookup = (orgId: string, accountId: string) => Promise<AccountHolderRef[]>;

@Injectable()
export class AccountHolderRegistry extends AccountHolderPort {
  private readonly lookups = new Map<string, HolderLookup>();

  register(holderType: string, lookup: HolderLookup): () => void {
    this.lookups.set(holderType, lookup);
    return () => {
      this.lookups.delete(holderType);
    };
  }

  async holders(orgId: string, accountId: string): Promise<AccountHolderRef[]> {
    const output: AccountHolderRef[] = [];
    for (const lookup of this.lookups.values()) {
      output.push(...(await lookup(orgId, accountId)));
    }
    return output;
  }
}

export function listOrgIds(layout: HostFsLayoutPort): string[] {
  try {
    return readdirSync(join(layout.home(), 'orgs'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}
