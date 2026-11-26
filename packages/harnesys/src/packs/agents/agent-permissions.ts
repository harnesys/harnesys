import type { ToolCallGate } from '../../ports/tools.ts';

export function permissionsAskGate(raw: unknown): ToolCallGate | undefined {
  const value = (raw ?? {}) as { permissions?: unknown };
  return value.permissions === undefined ? undefined : { decision: 'ask' };
}
