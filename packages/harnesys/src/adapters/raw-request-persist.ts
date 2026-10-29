import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestPlan } from '../application/llm-request-plan.ts';
import { redactSecrets } from '../application/redact-secrets.ts';
import { RAW_REQUEST_MAX_CHARS, RAW_REQUEST_RETENTION_MS } from '../constants.ts';
import type { NormalizeReport } from './ai-llm-normalize.ts';

export interface RawRequestPersistOptions {
  mode: 'meta' | 'full' | 'off';
  provider: string;
  model: string;
  runId?: string;
  plan?: RequestPlan;
  normalization?: NormalizeReport;
  summary: { messageCount: number; toolNames: string[] };
}

export async function persistRawRequest(
  dir: string,
  result: unknown,
  opts: RawRequestPersistOptions,
): Promise<void> {
  if (opts.mode === 'off') {
    return;
  }
  try {
    const requestMeta = await (result as { request?: PromiseLike<{ body?: unknown }> }).request;
    if (requestMeta?.body === undefined) {
      return;
    }
    const outDir = join(dir, 'raw-model-requests');
    await mkdir(outDir, { recursive: true });
    if (opts.mode === 'full') {
      await sweepExpiredRawRequests(outDir);
    }
    const meta: Record<string, unknown> = {
      ts: Date.now(),
      provider: opts.provider,
      model: opts.model,
      mode: opts.mode,
      ...(opts.runId ? { runId: opts.runId } : {}),
      ...(usageOf(result) !== undefined ? { usage: usageOf(result) } : {}),
      ...(opts.normalization ? { normalization: opts.normalization } : {}),
    };
    const request =
      opts.mode === 'full'
        ? JSON.parse(redactBase64(redactSecrets(JSON.stringify(requestMeta.body)) ?? 'null'))
        : opts.summary;
    let envelope = JSON.stringify({ meta, plan: opts.plan, request }, null, 2);
    if (envelope.length > RAW_REQUEST_MAX_CHARS) {
      envelope = JSON.stringify({
        meta,
        plan: opts.plan,
        request: { truncated: true, originalChars: envelope.length },
      });
    }
    const fileName = `${String(meta.ts)}-${crypto.randomUUID()}.json`;
    await writeFile(join(outDir, fileName), envelope, 'utf8');
  } catch {
    // best-effort debug artifact
  }
}

export async function persistRawRequestIfConfigured(
  rawRequestDir: string | undefined,
  mode: 'meta' | 'full' | 'off' | undefined,
  result: unknown,
  coords: { provider: string; model: string },
  extras: {
    runId?: string;
    plan?: RequestPlan;
    normalization?: NormalizeReport;
    summary: { messageCount: number; toolNames: string[] };
  },
): Promise<void> {
  if (!rawRequestDir) {
    return;
  }
  await persistRawRequest(rawRequestDir, result, {
    mode: mode ?? 'full',
    provider: coords.provider,
    model: coords.model,
    ...(extras.runId ? { runId: extras.runId } : {}),
    ...(extras.plan ? { plan: extras.plan } : {}),
    ...(extras.normalization ? { normalization: extras.normalization } : {}),
    summary: extras.summary,
  });
}

function redactBase64(serialized: string): string {
  return serialized
    .replace(
      /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]{4096,})/g,
      (_match, data: string) => `<redacted base64:${data.length} chars>`,
    )
    .replace(/"([A-Za-z0-9+/]{4096,}={0,2})"/g, (_match, data: string) =>
      JSON.stringify(`<redacted base64:${data.length} chars>`),
    );
}

function usageOf(result: unknown): Record<string, number> | undefined {
  const usage = (result as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }
  const u = usage as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'reasoningTokens',
    'cachedInputTokens',
  ]) {
    if (typeof u[key] === 'number') {
      out[key] = u[key];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function sweepExpiredRawRequests(outDir: string): Promise<void> {
  const cutoff = Date.now() - RAW_REQUEST_RETENTION_MS;
  const names = await readdir(outDir);
  await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .filter((name) => {
        const ts = Number.parseInt(name, 10);
        return Number.isFinite(ts) && ts < cutoff;
      })
      .map((name) => rm(join(outDir, name), { force: true }).catch(() => {})),
  );
}
