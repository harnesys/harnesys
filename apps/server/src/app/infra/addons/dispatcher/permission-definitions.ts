import { Injectable } from '@harnesys/brix';
import type { JsonObject, L10n } from '@harnesys/sdk';
import { z } from 'zod';
import type { PermissionDefinition } from '../../../domain/addons/permissions.ts';

export function hostMatchesPattern(host: string, pattern: string): boolean {
  const normalizedHost = host.toLowerCase();
  const normalized = pattern.toLowerCase();
  if (normalized === '*') {
    return true;
  }
  if (normalized.startsWith('*.')) {
    const suffix = normalized.slice(1);
    return normalizedHost.endsWith(suffix) || normalizedHost === normalized.slice(2);
  }
  return normalizedHost === normalized;
}

function listContains(granted: unknown, needed: unknown): boolean {
  if (!Array.isArray(granted)) {
    return true;
  }
  if (!Array.isArray(needed)) {
    return true;
  }
  const set = new Set(granted.map(String));
  return needed.map(String).every((entry) => set.has(entry));
}

function scopedListCovers(
  granted: JsonObject | undefined,
  needed: JsonObject | undefined,
  key: string,
): boolean {
  if (!granted || granted[key] === undefined) {
    return true;
  }
  if (!needed || needed[key] === undefined) {
    return false;
  }
  return listContains(granted[key], needed[key]);
}

const hostsScope = z.object({ hosts: z.array(z.string()).min(1) });
const connectionsScope = z.object({ connections: z.array(z.string()).min(1) });
const patternsScope = z.object({ patterns: z.array(z.string()).min(1) });

const httpFetchDefinition: PermissionDefinition = {
  id: 'http.fetch',
  risk: 'medium',
  scope: hostsScope,
  covers: (granted, needed) => {
    const grantedHosts = granted?.hosts;
    if (!Array.isArray(grantedHosts)) {
      return true;
    }
    const neededHosts = needed?.hosts;
    if (!Array.isArray(neededHosts)) {
      return false;
    }
    return neededHosts.every((host) =>
      grantedHosts.some((pattern) => hostMatchesPattern(String(host), String(pattern))),
    );
  },
  describe: (scope) => describeHostScope(scope),
};

const accountsUseDefinition: PermissionDefinition = {
  id: 'accounts.use',
  risk: 'medium',
  scope: connectionsScope,
  covers: (granted, needed) => scopedListCovers(granted, needed, 'connections'),
  describe: (scope) => describeConnectionScope('List and report bound accounts', scope),
};

const accountsCredentialsDefinition: PermissionDefinition = {
  id: 'accounts.credentials',
  risk: 'high',
  scope: connectionsScope,
  covers: (granted, needed) => scopedListCovers(granted, needed, 'connections'),
  describe: (scope) => describeConnectionScope('Read raw account credentials', scope),
};

const eventsSubscribeDefinition: PermissionDefinition = {
  id: 'events.subscribe',
  risk: 'low',
  scope: patternsScope,
  covers: (granted, needed) => scopedListCovers(granted, needed, 'patterns'),
  describe: (scope) => {
    const patterns = Array.isArray(scope?.patterns) ? scope.patterns.join(', ') : 'matching events';
    return `Subscribe to events: ${patterns}`;
  },
};

function baseline(id: string, description: string): PermissionDefinition {
  return {
    id,
    risk: 'low',
    baseline: true,
    covers: () => true,
    describe: () => description,
  };
}

function simple(
  id: string,
  risk: 'low' | 'medium' | 'high',
  description: string,
): PermissionDefinition {
  return {
    id,
    risk,
    covers: () => true,
    describe: () => description,
  };
}

function describeHostScope(scope: JsonObject | undefined): L10n {
  const hosts = Array.isArray(scope?.hosts) ? scope.hosts.join(', ') : 'any host';
  return `Send HTTP requests to: ${hosts}`;
}

function describeConnectionScope(action: string, scope: JsonObject | undefined): L10n {
  const connections = Array.isArray(scope?.connections)
    ? scope.connections.join(', ')
    : 'all connections';
  return `${action} for connections: ${connections}`;
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  baseline('config.read', 'Read the add-on configuration'),
  baseline('log', 'Write to the add-on log'),
  baseline('db', 'Use the add-on database'),
  baseline('secrets.own', 'Read the add-on own secrets'),
  baseline('events.emit.own', 'Emit events in the add-on namespace'),
  httpFetchDefinition,
  accountsUseDefinition,
  accountsCredentialsDefinition,
  simple('runs.dispatch', 'medium', 'Dispatch agent runs'),
  simple('threads.create', 'medium', 'Create conversation threads'),
  eventsSubscribeDefinition,
  simple('bridge.inbound', 'medium', 'Deliver inbound chat messages from the transport'),
  simple('files.read', 'medium', 'Read files in the organization workspace'),
  simple('files.write', 'high', 'Write files in the organization workspace'),
  simple('routes.public', 'high', 'Expose public HTTP routes without org authentication'),
  simple('lifecycle.resident', 'medium', 'Keep a resident process'),
  simple('trigger', 'medium', 'Run trigger instances and fire automation runs'),
  simple('worker', 'medium', 'Run background workers'),
  simple('source', 'medium', 'Serve as a knowledge-source backend for mounted cloud folders'),
];

@Injectable()
export class PermissionDefinitionRegistry {
  private readonly byId: ReadonlyMap<string, PermissionDefinition>;

  constructor() {
    this.byId = new Map(PERMISSION_DEFINITIONS.map((definition) => [definition.id, definition]));
  }

  get(id: string): PermissionDefinition | undefined {
    return this.byId.get(id);
  }

  all(): readonly PermissionDefinition[] {
    return [...this.byId.values()];
  }
}
