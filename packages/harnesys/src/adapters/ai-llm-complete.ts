import type { CallModelOptions } from './ai-llm-adapter.ts';
import type { StreamChunk } from './ai-llm-chunks.ts';
import type { NormalizeReport } from './ai-llm-normalize.ts';
import type { StreamState } from './ai-llm-stream-parts.ts';
import { persistRawRequestIfConfigured } from './raw-request-persist.ts';

async function resolveStructured(result: unknown): Promise<unknown> {
  try {
    const object = await (result as { object?: PromiseLike<unknown> }).object;
    if (object !== undefined) {
      return object;
    }
  } catch {}
  return undefined;
}
async function resolveUsage(result: unknown): Promise<unknown> {
  let usage: unknown = (globalThis as Record<string, unknown>).__harnesys_last_usage;
  try {
    const total = await (result as { totalUsage?: PromiseLike<unknown> }).totalUsage;
    if (total) {
      usage = total;
    }
  } catch {}
  try {
    const single = await (result as { usage?: PromiseLike<unknown> }).usage;
    if (single && !usage) {
      usage = single;
    }
  } catch {}
  return usage;
}
export async function completedChunk(
  result: unknown,
  state: StreamState,
): Promise<Extract<StreamChunk, { type: 'completed' }>> {
  let finishReason = state.finishReason;
  if (state.toolCalls.length > 0 && finishReason !== 'tool-calls' && finishReason !== 'length') {
    finishReason = 'tool-calls';
  }
  const structured = await resolveStructured(result);
  const usage = await resolveUsage(result);
  return {
    type: 'completed',
    finishReason,
    text: state.fullText || undefined,
    reasoning: state.reasoningText || undefined,
    toolCalls: state.toolCalls.length > 0 ? state.toolCalls : undefined,
    structured,
    sources: state.sources.length > 0 ? state.sources : undefined,
    files: state.files.length > 0 ? state.files : undefined,
    usage,
  };
}
export async function persistCallRawRequest(
  options: CallModelOptions,
  result: unknown,
  driver: string,
  toolNames: string[],
  normalization?: NormalizeReport,
): Promise<void> {
  await persistRawRequestIfConfigured(
    options.rawRequestDir,
    options.rawRequestMode,
    result,
    {
      provider: driver,
      model: options.binding.name,
    },
    {
      ...(options.runId ? { runId: options.runId } : {}),
      ...(options.rawRequestPlan ? { plan: options.rawRequestPlan } : {}),
      summary: { messageCount: options.messages.length, toolNames },
      ...(normalization ? { normalization } : {}),
    },
  );
}
