import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskEnvelope } from '@harnesys/contracts';
import { type InMemoryRunLifecycleStore, type RunEventFeed, type SessionEvent } from 'harnesys';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { LEGACY_PROVIDER_SECRET_PREFIX, vaultStorageKey } from '../../domain/secret/vault-keys.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import type { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { permissionsFromConfig } from '../runtime/agent-definition.mapper.ts';
import type { WorkExecutorDeps } from './work-executor.compose.ts';

export const RUN_EVENT_COALESCE_MS = 40;
export const TERMINAL_EVENT_TYPES = new Set([
  'run.completed',
  'run.failed',
  'run.cancelled',
  'done',
]);

export class MemorySecretStore extends SecretStorePort {
  constructor(private readonly values: Record<string, string>) {
    super();
  }
  get(_orgId: string, key: string): Promise<string | null> {
    return Promise.resolve(this.values[key] ?? null);
  }
  set(_orgId: string, key: string, value: string): Promise<void> {
    this.values[key] = value;
    return Promise.resolve();
  }
  delete(_orgId: string, key: string): Promise<void> {
    delete this.values[key];
    return Promise.resolve();
  }
  listKeys(_orgId: string): Promise<string[]> {
    return Promise.resolve(Object.keys(this.values));
  }
}

export interface WorkerTargetInput {
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
  orgId: string;
  threadId: string;
  agent: {
    sharedSourceIds: string[];
    config: Record<string, unknown>;
  };
  sourceId?: string;
  worktreeId?: string;
  directory?: string;
}

export function prepareWorkerTarget(input: WorkerTargetInput) {
  const threadDir = input.layout.threadDir(input.orgId, input.threadId);
  const sandboxDir = join(threadDir, 'sandbox');
  mkdirSync(sandboxDir, { recursive: true, mode: 0o700 });
  const attachmentsDir = join(threadDir, 'attachments');
  const localHostId = input.machineConfig.get().id;
  const worktreeRoot = resolveWorktreeRoot(input, localHostId);
  const primaryDirectory = input.directory ?? worktreeRoot ?? sandboxDir;
  if (input.directory && !isDirectory(input.directory)) {
    throw new Error(`run directory not found on host: ${input.directory}`);
  }
  const sourceRefs = input.agent.sharedSourceIds.map((sourceId) => {
    const source = input.sources.findById(input.orgId, sourceId);
    if (!source) {
      throw new Error(`shared source missing: ${sourceId}`);
    }
    const location = input.sourceLocation.resolve({
      orgId: input.orgId,
      sourceId,
      hostId: localHostId,
      ...(worktreeRoot && sourceId === input.sourceId && input.worktreeId
        ? { worktreeId: input.worktreeId }
        : {}),
    });
    return {
      id: source.id,
      name: source.name,
      root: location.absoluteRoot,
    };
  });
  return {
    permissions: permissionsFromConfig(input.agent.config) ?? {},
    paths: {
      allow: [attachmentsDir, primaryDirectory],
      write: [primaryDirectory],
      cwd: primaryDirectory,
      threadDir,
    },
    sourceRefs,
    threadDir,
  };
}

function resolveWorktreeRoot(input: WorkerTargetInput, localHostId: string): string | undefined {
  if (!input.worktreeId || !input.sourceId) {
    return undefined;
  }
  if (!input.agent.sharedSourceIds.includes(input.sourceId)) {
    throw new Error(`worktree source not shared with agent: ${input.sourceId}`);
  }
  const location = input.sourceLocation.resolve({
    orgId: input.orgId,
    sourceId: input.sourceId,
    hostId: localHostId,
    worktreeId: input.worktreeId,
  });
  return location.absoluteRoot;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function startEventForwarder(input: {
  feed: RunEventFeed;
  runId: string;
  leaseEpoch: number;
  fromSeq: number;
  sendFrame: (payload: string) => void;
  isCancelled: () => boolean;
  persistEvents?: (events: SessionEvent[]) => void;
}): { stop(): void } {
  let stopped = false;
  let buffer: SessionEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let cursor = input.fromSeq;

  const flush = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (buffer.length === 0 || stopped) {
      return;
    }
    const batch = buffer;
    buffer = [];
    const fromSeq = cursor;
    const last = batch[batch.length - 1];
    cursor = typeof last?.seq === 'number' ? last.seq : cursor;
    try {
      input.persistEvents?.(batch);
      input.sendFrame(
        JSON.stringify({
          kind: 'RUN_EVENT',
          runId: input.runId,
          leaseEpoch: input.leaseEpoch,
          fromSeq,
          events: batch,
        }),
      );
    } catch {
      // ignore send failures; dialer reconnect handles transport
    }
  };

  const enqueue = (event: SessionEvent): 'continue' | 'stop' => {
    if (typeof event.seq === 'number' && event.seq <= input.fromSeq) {
      return 'continue';
    }
    buffer.push(event);
    if (!flushTimer) {
      flushTimer = setTimeout(flush, RUN_EVENT_COALESCE_MS);
    }
    if (TERMINAL_EVENT_TYPES.has(event.type)) {
      flush();
      return 'stop';
    }
    return 'continue';
  };

  const subscription = (async () => {
    for await (const event of input.feed.subscribe(input.runId, input.fromSeq)) {
      if (stopped || input.isCancelled() || enqueue(event) === 'stop') {
        break;
      }
    }
    flush();
  })();
  void subscription.catch(() => undefined);

  return {
    stop() {
      stopped = true;
      flush();
    },
  };
}

export async function awaitTerminal(
  lifecycle: InMemoryRunLifecycleStore,
  runId: string,
  isCancelled: () => boolean,
): Promise<void> {
  for (;;) {
    const record = await lifecycle.get(runId);
    if (
      record &&
      (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled')
    ) {
      return;
    }
    if (isCancelled()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}

export function uniqueNames(names: string[]): string[] {
  return [...new Set(names.filter((name) => name.length > 0))];
}

export function wipeSecrets(values: Record<string, string>): void {
  for (const key of Object.keys(values)) {
    values[key] = '';
    delete values[key];
  }
}

export function secretValuesFromResolved(resolved: Record<string, string>): Record<string, string> {
  const secretValues: Record<string, string> = {};
  for (const [name, value] of Object.entries(resolved)) {
    secretValues[name] = value;
    if (!name.startsWith(LEGACY_PROVIDER_SECRET_PREFIX)) {
      secretValues[vaultStorageKey('secret', name)] = value;
    }
  }
  return secretValues;
}

export function notifyWorkerRunFailed(input: {
  runId: string;
  leaseEpoch: number;
  relayLastSeq: number;
  reason: string;
  sendFrame: (payload: string) => void;
  persistEvents?: ((events: SessionEvent[]) => void) | undefined;
}): void {
  const event = {
    type: 'run.failed',
    seq: input.relayLastSeq + 1,
    message: input.reason,
  } as SessionEvent;
  try {
    input.persistEvents?.([event]);
    input.sendFrame(
      JSON.stringify({
        kind: 'RUN_EVENT',
        runId: input.runId,
        leaseEpoch: input.leaseEpoch,
        fromSeq: input.relayLastSeq,
        events: [event],
      }),
    );
  } catch {
    // transport down; relay reaps the run by lease expiry
  }
}

export function prepareWorkerTargetOf(
  deps: WorkExecutorDeps,
  orgId: string,
  envelope: TaskEnvelope,
  agent: { sharedSourceIds: string[]; config: Record<string, unknown> },
): ReturnType<typeof prepareWorkerTarget> {
  return prepareWorkerTarget({
    layout: deps.layout,
    machineConfig: deps.machineConfig,
    sources: deps.sources,
    sourceLocation: deps.sourceLocation,
    orgId,
    threadId: envelope.threadId,
    agent,
    ...(envelope.directory ? { directory: envelope.directory } : {}),
    ...(envelope.sourceId ? { sourceId: envelope.sourceId } : {}),
    ...(envelope.worktreeId ? { worktreeId: envelope.worktreeId } : {}),
  });
}
