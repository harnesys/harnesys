import { Injectable } from '@harnesys/brix';
import { BrowserHostPort } from '../../../domain/browser/browser-host.port.ts';

@Injectable()
export class SetBrowserEngineStateUseCase {
  constructor(private readonly browserHost: BrowserHostPort) {}

  async execute(input: {
    orgId: string;
    hostId: string;
    engineId: string;
    enabled: boolean;
  }): Promise<{ engineId: string; enabled: boolean }> {
    await this.browserHost.setEnabled(input.hostId, input.engineId, input.enabled);
    return { engineId: input.engineId, enabled: input.enabled };
  }
}
