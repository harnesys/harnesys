import { Injectable } from '@harnesys/brix';
import { BrowserHostPort } from '../../../domain/browser/browser-host.port.ts';

@Injectable()
export class RemoveBrowserEngineUseCase {
  constructor(private readonly browserHost: BrowserHostPort) {}

  async execute(input: {
    orgId: string;
    hostId: string;
    engineId: string;
  }): Promise<{ engineId: string }> {
    await this.browserHost.remove(input.hostId, input.engineId);
    return { engineId: input.engineId };
  }
}
