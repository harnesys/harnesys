import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadExportReaderPort } from '../../domain/thread/thread-export-reader.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { membersOf, participantsOf } from './thread.helpers.ts';
import {
  createThreadExportBundle,
  type ThreadExportBundle,
  type ThreadExportSource,
} from './thread-export-bundle.ts';
import { isThreadRawModelRequestName } from './thread-raw-model-request-name.ts';

export interface ExportThreadRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class ExportThreadUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly reader: ThreadExportReaderPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: ExportThreadRequest): Promise<ThreadExportBundle> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const threadDir = this.layout.threadDir(request.orgId, request.threadId);
    const [events, runs, snapshots, plan, rawRequests, toolOutputs] = await Promise.all([
      this.reader.readEvents(request.orgId, request.threadId),
      this.reader.readRuns(request.orgId, request.threadId),
      this.reader.readSnapshots(request.orgId, request.threadId),
      this.reader.readPlan(request.orgId, request.threadId),
      readSources(join(threadDir, 'raw-model-requests'), isThreadRawModelRequestName),
      readSources(join(threadDir, 'tool-outputs'), acceptAll),
    ]);
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return createThreadExportBundle({
      orgId: request.orgId,
      thread,
      members: membersOf(deps, request.orgId, request.threadId),
      participants: participantsOf(deps, request.orgId, request.threadId),
      attachments: this.attachments.listByThread(request.orgId, request.threadId),
      events,
      runs,
      snapshots,
      plan,
      rawRequests,
      toolOutputs,
      exportedAt: new Date().toISOString(),
    });
  }
}

function acceptAll(): boolean {
  return true;
}

async function readSources(
  dir: string,
  accept: (name: string) => boolean,
): Promise<ThreadExportSource[]> {
  const names = await listFileNames(dir);
  return names
    .filter(accept)
    .map((name) => ({ name, bytes: () => readFileBytes(join(dir, name)) }));
}

async function readFileBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

async function listFileNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
