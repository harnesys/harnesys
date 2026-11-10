import type { AccountKindDescriptor, AppView } from '@harnesys/contracts';
import { candidateApps } from './catalog.ts';

export type ConnectStep = 'app' | 'pick-app' | 'inputs' | 'scopes' | 'connect';

export function planConnect(
  kind: AccountKindDescriptor,
  apps: AppView[],
  reconnect = false,
): ConnectStep[] {
  if (reconnect) {
    const steps: ConnectStep[] = [];
    if (kind.inputs.length > 0) {
      steps.push('inputs');
    }
    if (kind.scopes.options.length > 0) {
      steps.push('scopes');
    }
    steps.push('connect');
    return steps;
  }
  const steps: ConnectStep[] = [];
  if (kind.requiresApp.length > 0) {
    const candidates = candidateApps(apps, kind);
    if (candidates.length === 0) {
      steps.push('app');
    } else if (candidates.length > 1) {
      steps.push('pick-app');
    }
  }
  if (kind.inputs.length > 0) {
    steps.push('inputs');
  }
  if (kind.scopes.options.length > 0) {
    steps.push('scopes');
  }
  steps.push('connect');
  return steps;
}
