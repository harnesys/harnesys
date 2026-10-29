import { HttpException, Injectable } from '@harnesys/brix';
import { engineSpecOf } from 'harnesys';
import { BrowserHostPort } from '../../../domain/browser/browser-host.port.ts';

@Injectable()
export class AddBrowserAllowlistUseCase {
  constructor(private readonly browserHost: BrowserHostPort) {}

  async execute(input: {
    orgId: string;
    hostId: string;
    engineId: string;
  }): Promise<{ engineId: string }> {
    if (engineSpecOf(input.engineId) === undefined) {
      throw new HttpException(404, 'ENGINE_NOT_FOUND', `unknown engine ${input.engineId}`);
    }
    await this.browserHost.addToAllowlist(input.hostId, input.engineId);
    return { engineId: input.engineId };
  }
}
