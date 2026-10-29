type MessageRecord = Record<string, unknown>;

export const cacheBreakpointDrivers: ReadonlySet<string> = new Set(['anthropic', 'minimax']);
const CACHE_CONTROL = { type: 'ephemeral' } as const;
const BREAKPOINT_TAIL_LENGTH = 2;
export function withCacheBreakpoints(messages: readonly unknown[]): unknown[] {
  const out = [...messages];
  const start = Math.max(0, out.length - BREAKPOINT_TAIL_LENGTH);
  for (let i = start; i < out.length; i++) {
    const message = out[i] as MessageRecord;
    const anthropic = (message.providerOptions as Record<string, unknown> | undefined)?.anthropic;
    out[i] = {
      ...message,
      providerOptions: {
        ...(message.providerOptions as Record<string, unknown> | undefined),
        anthropic: {
          ...(anthropic as Record<string, unknown> | undefined),
          cacheControl: CACHE_CONTROL,
        },
      },
    };
  }
  return out;
}
