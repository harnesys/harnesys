import { z } from 'zod';

export interface HostEventDefinition {
  name: string;
  version: number;
  payload: z.ZodType;
}

const threadCreatedPayload = z.object({
  orgId: z.string(),
  threadId: z.string(),
  title: z.string(),
  kind: z.string(),
  agentId: z.string(),
  createdAt: z.string(),
});

const runStartedPayload = z.object({
  orgId: z.string(),
  threadId: z.string(),
  runId: z.string(),
  agentId: z.string(),
  trigger: z.object({ kind: z.string(), id: z.string() }),
});

const runFinishedPayload = z.object({
  orgId: z.string(),
  threadId: z.string(),
  runId: z.string(),
  status: z.enum(['completed', 'cancelled']),
});

const runFailedPayload = z.object({
  orgId: z.string(),
  threadId: z.string(),
  runId: z.string(),
  message: z.string(),
  at: z.string(),
});

const runParkedPayload = z.object({
  orgId: z.string(),
  threadId: z.string(),
  runId: z.string(),
  source: z.string(),
});

const runClearedPayload = z.object({
  orgId: z.string(),
  threadId: z.string(),
  runId: z.string(),
});

const accountEventPayload = z.object({
  type: z.string(),
  orgId: z.string(),
  appId: z.string().nullable(),
  accountId: z.string().nullable(),
  kind: z.string(),
  status: z.string().nullable(),
});

function accountEvent(name: string): HostEventDefinition {
  return { name, version: 1, payload: accountEventPayload };
}

const addonStateChangedPayload = z.object({
  type: z.literal('addon.state_changed'),
  orgId: z.string(),
  addonId: z.string(),
  at: z.string(),
  state: z.enum(['stopped', 'running', 'failed', 'quarantined']),
  lastError: z.string().nullable().optional(),
});

const addonConfigChangedPayload = z.object({
  orgId: z.string(),
  addonId: z.string(),
  keys: z.array(z.string()),
});

const addonPermissionsChangedPayload = z.object({
  orgId: z.string(),
  addonId: z.string(),
  grants: z.array(
    z.object({ id: z.string(), scope: z.record(z.string(), z.unknown()).optional() }),
  ),
  revoked: z.array(z.string()),
});

export const HOST_EVENT_CATALOG: readonly HostEventDefinition[] = [
  { name: 'thread.created', version: 1, payload: threadCreatedPayload },
  { name: 'run.started', version: 1, payload: runStartedPayload },
  { name: 'run.finished', version: 1, payload: runFinishedPayload },
  { name: 'run.failed', version: 1, payload: runFailedPayload },
  { name: 'run.parked', version: 1, payload: runParkedPayload },
  { name: 'run.cleared', version: 1, payload: runClearedPayload },
  accountEvent('app.created'),
  accountEvent('app.updated'),
  accountEvent('app.deleted'),
  accountEvent('account.connected'),
  accountEvent('account.updated'),
  accountEvent('account.status_changed'),
  accountEvent('account.removed'),
  { name: 'addon.state_changed', version: 1, payload: addonStateChangedPayload },
  { name: 'config.changed', version: 1, payload: addonConfigChangedPayload },
  { name: 'permissions.changed', version: 1, payload: addonPermissionsChangedPayload },
];

export function hostEventDefinition(name: string): HostEventDefinition | undefined {
  return HOST_EVENT_CATALOG.find((entry) => entry.name === name);
}
