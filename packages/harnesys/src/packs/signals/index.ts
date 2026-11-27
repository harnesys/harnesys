import { definePack } from '../../domain/pack.ts';
import { parseSignalKey } from '../../domain/signal-key.ts';
import type { SignalStorePort } from '../../ports/signal-store.ts';
import type { SignalWakePort } from '../../ports/signal-wake.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { runGuard } from '../issues/run-guard.ts';

export interface SignalsCapabilityPorts {
  signals: SignalStorePort;
  wake: SignalWakePort;
}
interface SignalFireInput {
  key: string;
}
export function createSignalFireTool(deps: {
  signals: SignalStorePort;
  wake: SignalWakePort;
  resolveScope: () => { orgId: string };
}): ToolDefinition {
  return tool('signal_fire', {
    group: 'signals',
    description:
      "Fire a free-form signal so runs parked on it via wait({ signal: key }) resume immediately. Key format '<kind>:<id>' (e.g. 'deploy:done'). The fire is sticky: runs that park on the key later still resume.",
    input: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          minLength: 1,
          description: "Signal key to fire, format '<kind>:<id>'.",
        },
      },
      required: ['key'],
      additionalProperties: false,
    },
    execute: (raw) =>
      runGuard(async () => {
        const key = (raw as SignalFireInput).key;
        const parsed = parseSignalKey(key);
        if (parsed === null) {
          throw new Error(`invalid signal key ${key}; expected '<kind>:<id>'`);
        }
        const scope = deps.resolveScope();
        deps.signals.recordFire(scope.orgId, key);
        await deps.wake.wake(scope.orgId, key);
        return { key, fired: true };
      }),
  });
}
export const signalsCapability = definePack<SignalsCapabilityPorts, Record<string, unknown>>({
  name: 'signals',
  version: '1.0.0',
  description:
    'Free-form signals: signal_fire wakes runs parked on the same key via wait({ signal }).',
  icon: 'signals',
  meta: {
    tools: [
      {
        name: 'signal_fire',
        description:
          "Fire a signal key ('<kind>:<id>', e.g. 'deploy:done'): runs parked on it via wait({ signal: key }) resume immediately; later parks resume too.",
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: [
      createSignalFireTool({
        signals: ctx.ports.signals,
        wake: ctx.ports.wake,
        resolveScope: () => ctx.scope,
      }),
    ],
    notes: () => [
      {
        tag: 'signals-usage',
        text:
          "Coordinate with other agents through free-form signals: agree on a key (e.g. 'deploy:done'), the waiting agent parks with wait({ signal: key, timeoutMs? }), the finishing agent calls signal_fire({ key }). " +
          "A parked wait resumes as soon as signal_fire or an issue-settle wake routed to the same key arrives (parking on 'issue:<issueId>' resumes when that issue's dispatched execution is no longer active); timeoutMs is only the fallback. " +
          'Fires are sticky per org: a later park on an already-fired key resumes on the next reconcile tick. Unknown keys simply wait for the timeout.',
      },
    ],
  }),
});
