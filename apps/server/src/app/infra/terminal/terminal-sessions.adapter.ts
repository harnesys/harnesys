import { Injectable } from '@harnesys/brix';
import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import type { ProcessJobRegistry } from 'harnesys';
import { createProcessJobRegistry, type ProcessJobRecord, sweepSshSockets } from 'harnesys';
import { TerminalEventsPort } from '../../domain/terminal/terminal-events.port.ts';
import {
  type CreateTerminalSessionInput,
  type TerminalDataListener,
  type TerminalExitListener,
  type TerminalJobSnapshot,
  TerminalSessionsPort,
} from '../../domain/terminal/terminal-session.port.ts';

interface SessionMeta {
  projectId: string;
  orgId: string;
}

function targetLabelOf(job: ProcessJobRecord | TerminalJobSnapshot): string {
  const target = job.target as
    | { kind?: string; host?: string; user?: string; containerId?: string }
    | undefined;
  if (target === undefined || target.kind === undefined || target.kind === 'host') {
    return 'host';
  }
  if (target.kind === 'container') {
    return `container:${target.containerId ?? ''}`;
  }
  const userPart = target.user === undefined ? '' : `${target.user}@`;
  return `ssh:${userPart}${target.host ?? ''}`;
}

function toSessionRecord(job: ProcessJobRecord, meta: SessionMeta): TerminalSessionRecord {
  return {
    id: job.id,
    projectId: meta.projectId,
    title: job.title,
    cwd: job.cwd,
    createdAt: job.createdAt,
    exitCode: job.exitCode,
    exited: job.status !== 'running',
    origin: job.origin ?? 'user',
    ...(meta.orgId === '' ? {} : { orgId: meta.orgId }),
    ...(job.name === undefined ? {} : { name: job.name }),
    target: targetLabelOf(job),
  };
}

const SWEEP_SSH_SOCKET_MAX_AGE_MS = 11 * 60 * 1000;

@Injectable()
export class TerminalSessionsAdapter extends TerminalSessionsPort {
  private readonly jobs: ProcessJobRegistry;
  private readonly metaBySession = new Map<string, SessionMeta>();
  private readonly titleIndexByProject = new Map<string, number>();
  private readonly exitWatched = new Set<string>();

  constructor(private readonly events: TerminalEventsPort) {
    super();
    this.jobs = createProcessJobRegistry();
    this.sweepSshSockets();
  }

  private sweepSshSockets(): void {
    try {
      sweepSshSockets(`${process.env.HOME ?? ''}/.harnesys/run/ssh`, SWEEP_SSH_SOCKET_MAX_AGE_MS);
    } catch {
      // best effort: ssh socket sweep must never block boot
    }
  }

  list(projectId: string): TerminalSessionRecord[] {
    return this.listAll().filter((record) => record.projectId === projectId);
  }

  listAll(orgId?: string): TerminalSessionRecord[] {
    const records: TerminalSessionRecord[] = [];
    for (const [sessionId, meta] of this.metaBySession) {
      const job = this.jobs.get(sessionId);
      if (!job) {
        this.metaBySession.delete(sessionId);
        continue;
      }
      if (orgId !== undefined && meta.orgId !== orgId) {
        continue;
      }
      records.push(toSessionRecord(job, meta));
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(sessionId: string): TerminalSessionRecord | null {
    const job = this.jobs.get(sessionId);
    const meta = this.metaBySession.get(sessionId);
    if (!job || meta === undefined) {
      return null;
    }
    return toSessionRecord(job, meta);
  }

  create(input: CreateTerminalSessionInput): TerminalSessionRecord {
    const titleIndex = (this.titleIndexByProject.get(input.projectId) ?? 0) + 1;
    this.titleIndexByProject.set(input.projectId, titleIndex);
    const title = titleIndex === 1 ? 'Terminal' : `Terminal ${titleIndex}`;
    const job = this.jobs.start({
      cwd: input.cwd,
      mode: 'pty',
      command: process.env.SHELL ?? '/bin/zsh',
      title,
      origin: 'user',
      ...(input.orgId === undefined ? {} : { orgId: input.orgId }),
    });
    const meta: SessionMeta = { projectId: input.projectId, orgId: input.orgId ?? '' };
    this.metaBySession.set(job.id, meta);
    this.watchExit(job.id);
    this.emitChanged(job.id);
    return toSessionRecord(job, meta);
  }

  private watchExit(sessionId: string): void {
    if (this.exitWatched.has(sessionId)) {
      return;
    }
    this.exitWatched.add(sessionId);
    this.jobs.subscribe(
      sessionId,
      () => {},
      () => this.emitChanged(sessionId),
    );
  }

  upsertExternal(job: TerminalJobSnapshot): void {
    const meta: SessionMeta = { projectId: '', orgId: job.orgId ?? '' };
    this.metaBySession.set(job.id, meta);
    this.watchExit(job.id);
    this.emitChanged(job.id);
  }

  jobRegistry(): ProcessJobRegistry {
    return this.jobs;
  }

  write(sessionId: string, data: string): boolean {
    return this.jobs.write(sessionId, data);
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    return this.jobs.resize(sessionId, cols, rows);
  }

  subscribe(
    sessionId: string,
    onData: TerminalDataListener,
    onExit?: TerminalExitListener,
  ): (() => void) | null {
    return this.jobs.subscribe(sessionId, onData, onExit);
  }

  scrollback(sessionId: string): string | null {
    return this.jobs.read(sessionId)?.text ?? null;
  }

  delete(sessionId: string): boolean {
    const meta = this.metaBySession.get(sessionId);
    const removed = this.jobs.delete(sessionId);
    if (removed) {
      this.metaBySession.delete(sessionId);
      this.exitWatched.delete(sessionId);
      this.events.emit(meta?.orgId ?? '', { type: 'removed', sessionId });
    }
    return removed;
  }

  private emitChanged(sessionId: string): void {
    const record = this.get(sessionId);
    if (record === null) {
      return;
    }
    this.events.emit(record.orgId ?? '', { type: 'changed', session: record });
  }
}
