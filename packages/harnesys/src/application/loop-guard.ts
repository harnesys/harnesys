export const NUDGE_AFTER_IDENTICAL_CALLS = 4;
export const STOP_AFTER_IDENTICAL_CALLS = 8;
export interface LoopGuardState {
  streak: number;
  tool: string;
  signature: string;
}
export function createLoopGuardState(): LoopGuardState {
  return { streak: 0, tool: '', signature: '' };
}
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  return value;
}
export function toolCallSignature(name: string, args: unknown): string {
  return JSON.stringify({ name, args: canonicalize(args ?? {}) });
}
export function recordToolCall(state: LoopGuardState, name: string, signature: string): void {
  if (signature === state.signature) {
    state.streak += 1;
    return;
  }
  state.streak = 1;
  state.tool = name;
  state.signature = signature;
}
