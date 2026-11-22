import { Injectable } from '@harnesys/brix';
import { SignalStorePort, SignalWakePort } from 'harnesys';
import { setSignalToolsDeps } from './signal-tools.holder.ts';

@Injectable()
export class SignalToolsProvider {
  constructor(
    private readonly store: SignalStorePort,
    private readonly wake: SignalWakePort,
  ) {
    setSignalToolsDeps({ store: this.store, wake: this.wake });
  }
}
