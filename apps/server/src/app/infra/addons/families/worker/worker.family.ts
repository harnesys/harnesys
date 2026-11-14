import { Injectable, Logger } from '@harnesys/brix';
import { WorkerDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';
import { AddonCallPort } from '../../../../domain/addons/ports/addon-call.port.ts';
import type { WorkerReportInput, WorkerReportSink } from '../sinks-reference.ts';

type WorkerSchema = z.infer<typeof WorkerDescriptorSchema>;

const HANDLERS: readonly HandlerSpec[] = [handlerSpec('worker.start'), handlerSpec('worker.stop')];
const WORKER_CALL_TIMEOUT_MS = 15_000;
const WORKER_RESTART_PAUSE_MS = 5_000;

@Injectable()
export class WorkerDescriptorStore {
  private readonly entries = new Map<string, Map<string, WorkerSchema>>();

  add(owner: OwnerKey, d: WorkerSchema): void {
    const byWorker = this.entries.get(ownerKeyId(owner)) ?? new Map<string, WorkerSchema>();
    byWorker.set(d.id, d);
    this.entries.set(ownerKeyId(owner), byWorker);
  }

  removeOwner(owner: OwnerKey): void {
    this.entries.delete(ownerKeyId(owner));
  }

  find(orgId: string, addonId: string, workerId: string): WorkerSchema | undefined {
    for (const [key, byWorker] of this.entries.entries()) {
      if (!key.startsWith(`${orgId}/${addonId}@`)) {
        continue;
      }
      return byWorker.get(workerId);
    }
    return undefined;
  }

  autostartOf(orgId: string, addonId: string): WorkerSchema[] {
    const result: WorkerSchema[] = [];
    for (const [key, byWorker] of this.entries.entries()) {
      if (!key.startsWith(`${orgId}/${addonId}@`)) {
        continue;
      }
      for (const descriptor of byWorker.values()) {
        if (descriptor.autostart) {
          result.push(descriptor);
        }
      }
    }
    return result;
  }

  allOf(orgId: string, addonId: string): WorkerSchema[] {
    const result: WorkerSchema[] = [];
    for (const [key, byWorker] of this.entries.entries()) {
      if (!key.startsWith(`${orgId}/${addonId}@`)) {
        continue;
      }
      result.push(...byWorker.values());
    }
    return result;
  }
}

@Injectable()
export class WorkerReportService implements WorkerReportSink {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly descriptors: WorkerDescriptorStore,
    private readonly calls: AddonCallPort,
    private readonly logger: Logger,
  ) {}

  async report(input: WorkerReportInput): Promise<void> {
    const descriptor = this.descriptors.find(input.orgId, input.addonId, input.workerId);
    if (descriptor === undefined || input.state !== 'failed') {
      return;
    }
    if (descriptor.restart !== 'on-failure') {
      return;
    }
    const timerKey = `${input.orgId}/${input.addonId}/${input.workerId}`;
    const existing = this.timers.get(timerKey);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.timers.delete(timerKey);
      void this.calls
        .workerStart(
          input.orgId,
          input.addonId,
          { workerId: input.workerId },
          { timeoutMs: WORKER_CALL_TIMEOUT_MS },
        )
        .catch((error: unknown) => {
          this.logger.warn({ err: error, workerId: input.workerId }, 'worker restart failed');
        });
    }, WORKER_RESTART_PAUSE_MS);
    this.timers.set(timerKey, timer);
  }

  disposeOwner(owner: OwnerKey): void {
    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(`${ownerKeyId(owner)}/`)) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }
  }
}

@Injectable()
export class WorkerFamilyModule implements FamilyModule<WorkerSchema> {
  readonly family = 'worker';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
  readonly permissions: readonly string[] = [];

  constructor(
    private readonly store: WorkerDescriptorStore,
    private readonly reports: WorkerReportService,
    private readonly calls: AddonCallPort,
  ) {}

  schema(_v: number): z.ZodType<WorkerSchema> {
    return WorkerDescriptorSchema as z.ZodType<WorkerSchema>;
  }

  register(owner: OwnerKey, d: WorkerSchema): Disposable {
    this.store.add(owner, d);
    return {
      dispose: () => {
        for (const worker of this.store.allOf(owner.orgId, owner.addonId)) {
          void this.calls
            .workerStop(
              owner.orgId,
              owner.addonId,
              { workerId: worker.id },
              { timeoutMs: WORKER_CALL_TIMEOUT_MS },
            )
            .catch(() => undefined);
        }
        this.reports.disposeOwner(owner);
        this.store.removeOwner(owner);
      },
    };
  }

  async startAutostartWorkers(orgId: string, addonId: string): Promise<void> {
    for (const worker of this.store.autostartOf(orgId, addonId)) {
      await this.calls.workerStart(
        orgId,
        addonId,
        { workerId: worker.id },
        { timeoutMs: WORKER_CALL_TIMEOUT_MS },
      );
    }
  }

  async stopWorkers(orgId: string, addonId: string): Promise<void> {
    for (const worker of this.store.allOf(orgId, addonId)) {
      await this.calls.workerStop(
        orgId,
        addonId,
        { workerId: worker.id },
        { timeoutMs: WORKER_CALL_TIMEOUT_MS },
      );
    }
  }
}
