import { Injectable } from '@harnesys/brix';
import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import type { ProcessJobRegistry } from 'harnesys';
import { createProcessJobRegistry, type ProcessJobRecord } from 'harnesys';
import {
  type CreateTerminalSessionInput,
  type TerminalDataListener,
  type TerminalExitListener,
  TerminalSessionsPort,
} from '../../domain/terminal/terminal-session.port.ts';

function toSessionRecord(job: ProcessJobRecord, projectId: string): TerminalSessionRecord {
  return {
    id: job.id,
    projectId,
    title: job.title,
    cwd: job.cwd,
    createdAt: job.createdAt,
    exitCode: job.exitCode,
    exited: job.status !== 'running',
  };
}

@Injectable()
export class TerminalSessionsAdapter extends TerminalSessionsPort {
  private readonly jobs: ProcessJobRegistry;
  private readonly projectBySession = new Map<string, string>();
  private readonly titleIndexByProject = new Map<string, number>();

  constructor() {
    super();
    this.jobs = createProcessJobRegistry();
  }

  list(projectId: string): TerminalSessionRecord[] {
    const records: TerminalSessionRecord[] = [];
    for (const [sessionId, sessionProjectId] of this.projectBySession) {
      if (sessionProjectId !== projectId) {
        continue;
      }
      const job = this.jobs.get(sessionId);
      if (!job) {
        this.projectBySession.delete(sessionId);
        continue;
      }
      records.push(toSessionRecord(job, projectId));
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(sessionId: string): TerminalSessionRecord | null {
    const job = this.jobs.get(sessionId);
    const projectId = this.projectBySession.get(sessionId);
    if (!job || projectId === undefined) {
      return null;
    }
    return toSessionRecord(job, projectId);
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
    });
    this.projectBySession.set(job.id, input.projectId);
    return toSessionRecord(job, input.projectId);
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
    const removed = this.jobs.delete(sessionId);
    if (removed) {
      this.projectBySession.delete(sessionId);
    }
    return removed;
  }
}
