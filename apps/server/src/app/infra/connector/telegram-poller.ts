import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { ApplyTelegramUpdateUseCase } from '../../application/connectors/apply-telegram-update.use-case.ts';
import { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { tryAcquireLease } from '../../domain/connector/lease.ts';
import {
  TelegramApiPort,
  TelegramBlockedError,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
import { TelegramPollerSyncPort } from '../../domain/connector/telegram-poller-sync.port.ts';
import {
  ConnectorUpdateError,
  parseTelegramUpdate,
} from '../../domain/connector/telegram-update.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { isAbortError, loopKey, sleep } from './telegram-poller.util.ts';

const LEASE_TTL_MS = 15_000;
const LEASE_RENEW_MS = 5_000;
const BUSY_SLEEP_MS = 5_000;
const GET_UPDATES_TIMEOUT_SEC = 25;

interface LoopState {
  orgId: string;
  connectorId: string;
  abort: AbortController;
  renewTimer: ReturnType<typeof setInterval> | null;
  running: Promise<void>;
}

@Injectable()
export class TelegramPoller
  extends TelegramPollerSyncPort
  implements ModuleInitHook, ModuleDestroyHook
{
  private readonly log: Logger;
  private readonly loops = new Map<string, LoopState>();
  private readonly offsets = new Map<string, number>();
  private stopped = false;

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly machineConfig: MachineConfigPort,
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly telegram: TelegramApiPort,
    private readonly applyUpdate: ApplyTelegramUpdateUseCase,
    private readonly outbound: ConnectorOutboundPort,
    logger: Logger,
  ) {
    super();
    this.log = logger.child('telegram-poller');
  }

  onModuleInit(): void {
    for (const entry of this.orgs.list()) {
      if (entry.role !== 'relay') {
        continue;
      }
      for (const connector of this.connectors.listByOrg(entry.orgId)) {
        if (connector.provider !== 'telegram') {
          continue;
        }
        this.sync(entry.orgId, connector.id);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    const keys = [...this.loops.keys()];
    for (const key of keys) {
      await this.stopLoop(key, true);
    }
  }

  override sync(orgId: string, connectorId: string): void {
    if (this.stopped) {
      return;
    }
    const key = loopKey(orgId, connectorId);
    if (!this.shouldPoll(orgId, connectorId)) {
      void this.stopLoop(key, true);
      return;
    }
    if (this.loops.has(key)) {
      return;
    }
    const abort = new AbortController();
    const state: LoopState = {
      orgId,
      connectorId,
      abort,
      renewTimer: null,
      running: Promise.resolve(),
    };
    state.running = this.runLoop(orgId, connectorId, abort);
    this.loops.set(key, state);
    void this.outbound.resumeStreaming(orgId, connectorId);
  }

  private shouldPoll(orgId: string, connectorId: string): boolean {
    const org = this.orgs.get(orgId);
    if (org?.role !== 'relay') {
      return false;
    }
    const connector = this.connectors.listByOrg(orgId).find((row) => row.id === connectorId);
    if (connector?.provider !== 'telegram') {
      return false;
    }
    return connector.status === 'active' || connector.status === 'awaiting_pair';
  }

  private async runLoop(orgId: string, connectorId: string, abort: AbortController): Promise<void> {
    const key = loopKey(orgId, connectorId);
    const me = this.machineConfig.get().id;
    try {
      while (!abort.signal.aborted && !this.stopped) {
        const step = await this.pollOnce({ orgId, connectorId, key, me, abort });
        if (step === 'stop') {
          break;
        }
      }
    } finally {
      this.clearLeaseIfMine(orgId, connectorId, me);
      this.loops.delete(key);
    }
  }

  private async pollOnce(input: {
    orgId: string;
    connectorId: string;
    key: string;
    me: string;
    abort: AbortController;
  }): Promise<'continue' | 'stop'> {
    if (!this.shouldPoll(input.orgId, input.connectorId)) {
      return 'stop';
    }
    const connector = this.connectors
      .listByOrg(input.orgId)
      .find((row) => row.id === input.connectorId);
    if (!connector) {
      return 'stop';
    }
    const decision = tryAcquireLease({
      owner: connector.leaseOwner,
      until: connector.leaseUntil,
      me: input.me,
      now: Date.now(),
    });
    if (decision === 'busy') {
      await sleep(BUSY_SLEEP_MS, input.abort.signal);
      return 'continue';
    }
    this.writeLease(input.orgId, input.connectorId, input.me);
    this.startRenew(input.key, input.orgId, input.connectorId, input.me);
    try {
      return await this.fetchAndApply(input, connector.secretRef);
    } finally {
      this.stopRenew(input.key);
    }
  }

  private async fetchAndApply(
    input: {
      orgId: string;
      connectorId: string;
      key: string;
      abort: AbortController;
    },
    secretRef: string,
  ): Promise<'continue' | 'stop'> {
    const token = await this.secrets.get(input.orgId, secretRef);
    if (!token) {
      this.markError(input.orgId, input.connectorId, 'Connector token is missing');
      return 'stop';
    }
    try {
      const updates = await this.telegram.getUpdates(
        token,
        this.offsets.get(input.key) ?? 0,
        GET_UPDATES_TIMEOUT_SEC,
        input.abort.signal,
      );
      for (const update of updates) {
        await this.handleUpdate(input.orgId, input.connectorId, input.key, update);
      }
      return 'continue';
    } catch (error) {
      return this.onPollError(input, error);
    }
  }

  private async onPollError(
    input: { orgId: string; connectorId: string; abort: AbortController },
    error: unknown,
  ): Promise<'continue' | 'stop'> {
    if (input.abort.signal.aborted || isAbortError(error)) {
      return 'stop';
    }
    if (error instanceof TelegramUnauthorizedError || error instanceof TelegramBlockedError) {
      this.markError(input.orgId, input.connectorId, error.message);
      return 'stop';
    }
    this.log.warn(
      {
        orgId: input.orgId,
        connectorId: input.connectorId,
        err: error instanceof Error ? error.message : String(error),
      },
      'telegram poll failed',
    );
    await sleep(BUSY_SLEEP_MS, input.abort.signal);
    return 'continue';
  }

  private async handleUpdate(
    orgId: string,
    connectorId: string,
    key: string,
    update: unknown,
  ): Promise<void> {
    const root =
      update !== null && typeof update === 'object' && !Array.isArray(update)
        ? (update as Record<string, unknown>)
        : null;
    const updateId = root?.update_id;
    if (typeof updateId !== 'number') {
      return;
    }
    this.offsets.set(key, updateId + 1);
    try {
      const canonical = parseTelegramUpdate(update);
      await this.applyUpdate.execute({
        orgId,
        connectorId,
        updateId,
        update: canonical,
      });
    } catch (error) {
      if (error instanceof ConnectorUpdateError) {
        return;
      }
      this.log.warn(
        {
          orgId,
          connectorId,
          updateId,
          err: error instanceof Error ? error.message : String(error),
        },
        'telegram update apply failed',
      );
    }
  }

  private writeLease(orgId: string, connectorId: string, me: string): void {
    const until = new Date(Date.now() + LEASE_TTL_MS).toISOString();
    this.connectors.update(orgId, connectorId, {
      leaseOwner: me,
      leaseUntil: until,
      updatedAt: new Date().toISOString(),
    });
  }

  private clearLeaseIfMine(orgId: string, connectorId: string, me: string): void {
    const connector = this.connectors.listByOrg(orgId).find((row) => row.id === connectorId);
    if (!connector || connector.leaseOwner !== me) {
      return;
    }
    this.connectors.update(orgId, connectorId, {
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: new Date().toISOString(),
    });
  }

  private markError(orgId: string, connectorId: string, lastError: string): void {
    this.connectors.update(orgId, connectorId, {
      status: 'error',
      lastError,
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: new Date().toISOString(),
    });
  }

  private startRenew(key: string, orgId: string, connectorId: string, me: string): void {
    const state = this.loops.get(key);
    if (!state || state.renewTimer) {
      return;
    }
    state.renewTimer = setInterval(() => {
      if (!this.shouldPoll(orgId, connectorId)) {
        return;
      }
      this.writeLease(orgId, connectorId, me);
    }, LEASE_RENEW_MS);
  }

  private stopRenew(key: string): void {
    const state = this.loops.get(key);
    if (!state?.renewTimer) {
      return;
    }
    clearInterval(state.renewTimer);
    state.renewTimer = null;
  }

  private async stopLoop(key: string, clearLease: boolean): Promise<void> {
    const state = this.loops.get(key);
    if (!state) {
      return;
    }
    this.stopRenew(key);
    state.abort.abort();
    try {
      await state.running;
    } catch {
      // loop swallows its own errors
    }
    if (clearLease) {
      this.clearLeaseIfMine(state.orgId, state.connectorId, this.machineConfig.get().id);
    }
  }
}
