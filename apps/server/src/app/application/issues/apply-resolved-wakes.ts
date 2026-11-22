import type { SignalWakePort } from 'harnesys';
import { issueWakeKey } from 'harnesys';
import type { ResolvedFire } from '../../domain/issue/resolve-fire.ts';

export async function applyResolvedWakes(
  deps: { wake: SignalWakePort },
  orgId: string,
  issueId: string,
  resolved: ResolvedFire,
): Promise<void> {
  const wakeKey = issueWakeKey(issueId);
  for (const agentId of resolved.wakes) {
    await deps.wake.wake(orgId, wakeKey, agentId);
  }
}
