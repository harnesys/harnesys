import { Logger } from '@harnesys/brix';
import type { ApprovalStatus } from '@harnesys/contracts';
import { ApprovalNotFoundException } from '../../domain/approval/approval.error.ts';
import type { ApprovalRecord, ApprovalResumePlan } from '../../domain/approval/approval.ts';
import {
  type ApprovalEvent,
  ApprovalEventsPort,
} from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { FileRuleInsert, FileRuleRecord } from '../../domain/file-access/file-access-rule.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import type { HostConfig } from '../../domain/machine/machine-config.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import {
  type ResolvedSourceLocation,
  type ResolveSourceLocationInput,
  SourceLocationPort,
} from '../../domain/source/source-location.port.ts';

export class StubFileRules extends FileAccessRulePort {
  readonly inserted: FileRuleInsert[] = [];

  list(): FileRuleRecord[] {
    return [];
  }

  listForAgent(): FileRuleRecord[] {
    return [];
  }

  insert(rule: FileRuleInsert): FileRuleRecord {
    this.inserted.push(rule);
    return {
      id: `rule-${this.inserted.length}`,
      ...rule,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
  }

  remove(): void {}
}

export class StubMachineConfig extends MachineConfigPort {
  get(): HostConfig {
    return { id: 'host-1', name: 'Host', listen: '', token: '' };
  }

  set(): void {}
}

export class StubSourceLocation extends SourceLocationPort {
  resolve(_input: ResolveSourceLocationInput): ResolvedSourceLocation {
    throw new Error('not used');
  }
}

export class MemoryApprovalEvents extends ApprovalEventsPort {
  readonly emitted: ApprovalEvent[] = [];

  subscribe(): () => void {
    return () => {};
  }

  emit(_orgId: string, event: ApprovalEvent): void {
    this.emitted.push(event);
  }
}

class SilentLogger extends Logger {
  child(): Logger {
    return new SilentLogger();
  }

  info(): void {}

  debug(): void {}

  warn(): void {}

  error(): void {}
}

export function silentLogger(): Logger {
  return new SilentLogger();
}

export class MemoryApprovalStore extends ApprovalStorePort {
  private readonly rows = new Map<string, ApprovalRecord>();

  seed(row: ApprovalRecord): this {
    this.rows.set(row.id, { ...row });
    return this;
  }

  request(): { id: string } {
    throw new Error('not used');
  }

  decide(
    _orgId: string,
    input: {
      approvalId: string;
      decision: string;
      surface?: string;
      note?: string;
      resume?: ApprovalResumePlan;
    },
  ): { winner: boolean; status: ApprovalStatus } {
    const row = this.rows.get(input.approvalId);
    if (!row) {
      throw new ApprovalNotFoundException(input.approvalId);
    }
    if (row.status !== 'pending') {
      return { winner: false, status: row.status };
    }
    const status: ApprovalStatus =
      input.decision === 'deny' || input.decision === 'block_path' ? 'denied' : 'approved';
    row.status = status;
    row.resumeState = 'decided';
    row.context = {
      ...row.context,
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.resume === undefined ? {} : { resume: input.resume }),
    };
    return { winner: true, status };
  }

  list(): ApprovalRecord[] {
    return [];
  }

  get(_orgId: string, approvalId: string): ApprovalRecord | null {
    return this.rows.get(approvalId) ?? null;
  }

  getByRunInterrupt(_orgId: string, runId: string, interruptId: string): ApprovalRecord | null {
    for (const row of this.rows.values()) {
      if (row.runId === runId && row.interruptId === interruptId && row.status === 'pending') {
        return row;
      }
    }
    return null;
  }

  markRunCancelled(_orgId: string, runId: string): ApprovalRecord[] {
    const closed: ApprovalRecord[] = [];
    for (const row of this.rows.values()) {
      if (row.runId !== runId || row.status !== 'pending') {
        continue;
      }
      row.status = 'cancelled';
      row.decidedBy = 'system';
      row.decidedAt = new Date().toISOString();
      row.decisionSeq += 1;
      closed.push({ ...row });
    }
    return closed;
  }

  listResumable(_orgId: string, olderThan: string, limit: number): ApprovalRecord[] {
    return [...this.rows.values()]
      .filter((row) => row.resumeState === 'decided' && (row.decidedAt ?? '') <= olderThan)
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  markResumeApplied(_orgId: string, approvalId: string): ApprovalRecord | null {
    const row = this.rows.get(approvalId);
    if (row?.resumeState !== 'decided') {
      return null;
    }
    row.resumeState = 'applied';
    return { ...row };
  }

  markResumeCancelled(_orgId: string, approvalId: string): ApprovalRecord | null {
    const row = this.rows.get(approvalId);
    if (row?.resumeState !== 'decided') {
      return null;
    }
    row.status = 'cancelled';
    row.resumeState = 'applied';
    row.decidedBy = 'system';
    row.decidedAt = new Date().toISOString();
    row.decisionSeq += 1;
    return { ...row };
  }
}

export class StubEventClaims extends EventClaimPort {
  grant(): never {
    throw new Error('not used');
  }

  findByRun(): null {
    return null;
  }

  findActiveByNode(): [] {
    return [];
  }

  countActiveByNode(): 0 {
    return 0;
  }

  renew(): false {
    return false;
  }

  markDone(): false {
    return false;
  }

  findExpired(): [] {
    return [];
  }

  releaseExpired(): 0 {
    return 0;
  }
}

export class StubNodeCommands extends NodeCommandQueuePort {
  enqueue(): void {}

  list(): [] {
    return [];
  }

  remove(): void {}

  drain(): Promise<void> {
    return Promise.resolve();
  }
}
