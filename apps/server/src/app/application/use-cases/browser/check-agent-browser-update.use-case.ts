import { HttpException, Injectable } from '@harnesys/brix';
import type { AgentBrowserUpdateCheck } from 'harnesys';
import { BrowserHostPort, LOCAL_HOST_ID } from '../../../domain/browser/browser-host.port.ts';

@Injectable()
export class CheckAgentBrowserUpdateUseCase {
  constructor(private readonly browserHost: BrowserHostPort) {}

  async execute(input: { orgId: string; hostId: string }): Promise<AgentBrowserUpdateCheck> {
    if (input.hostId !== LOCAL_HOST_ID) {
      throw new HttpException(
        400,
        'HOST_INSTALL_UNSUPPORTED',
        `update check is only supported on ${LOCAL_HOST_ID} host in v1`,
      );
    }
    return await this.browserHost.checkAgentBrowserUpdate(input.hostId);
  }
}
