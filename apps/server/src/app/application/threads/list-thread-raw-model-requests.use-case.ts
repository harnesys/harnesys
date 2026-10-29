import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface RawRequestMeta {
  ts: number;
  provider: string;
  model: string;
  mode: string;
  usage?: unknown;
}

export interface RawRequestPlanSection {
  id: string;
  chars: number;
  estTokens: number;
}

export interface RawRequestPlan {
  sections: RawRequestPlanSection[];
  totalChars: number;
  totalEstTokens: number;
}

export interface ThreadRawModelRequestSummary {
  name: string;
  meta?: RawRequestMeta;
  plan?: RawRequestPlan;
  summary?: { messageCount: number; toolNames: string[] };
  truncated?: boolean;
}

interface RawRequestEnvelope {
  meta?: RawRequestMeta;
  plan?: RawRequestPlan;
  request?: unknown;
}

@Injectable()
export class ListThreadRawModelRequestsUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(orgId: string, threadId: string): Promise<ThreadRawModelRequestSummary[]> {
    if (!this.threads.findById(orgId, threadId)) {
      throw new ThreadNotFoundException(threadId);
    }
    const dir = join(this.layout.threadDir(orgId, threadId), 'raw-model-requests');
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const items: ThreadRawModelRequestSummary[] = [];
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      const item = await readSummary(join(dir, name), name);
      if (item) {
        items.push(item);
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }
}

async function readSummary(
  path: string,
  name: string,
): Promise<ThreadRawModelRequestSummary | null> {
  try {
    const raw = await readFile(path, 'utf8');
    const envelope = JSON.parse(raw) as RawRequestEnvelope;
    const summary = isRequestSummary(envelope.request) ? envelope.request : undefined;
    const truncated = isTruncatedMarker(envelope.request);
    return {
      name,
      ...(envelope.meta ? { meta: envelope.meta } : {}),
      ...(envelope.plan ? { plan: envelope.plan } : {}),
      ...(summary ? { summary } : {}),
      ...(truncated ? { truncated: true } : {}),
    };
  } catch {
    return null;
  }
}

function isRequestSummary(value: unknown): value is { messageCount: number; toolNames: string[] } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v.messageCount === 'number' && Array.isArray(v.toolNames);
}

function isTruncatedMarker(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).truncated === true
  );
}
