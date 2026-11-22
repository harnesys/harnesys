import type { SignalStorePort, SignalWakePort } from 'harnesys';

export interface SignalToolsDeps {
  store: SignalStorePort;
  wake: SignalWakePort;
}

let current: SignalToolsDeps | undefined;

export function setSignalToolsDeps(deps: SignalToolsDeps): void {
  current = deps;
}

export function signalToolsDeps(): SignalToolsDeps | undefined {
  return current;
}
