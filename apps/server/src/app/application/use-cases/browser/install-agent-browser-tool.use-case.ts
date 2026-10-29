import { HttpException, Injectable } from '@harnesys/brix';
import type { AgentBrowserToolInstallResult } from '../../../domain/browser/browser-host.port.ts';
import { BrowserHostPort, LOCAL_HOST_ID } from '../../../domain/browser/browser-host.port.ts';

@Injectable()
export class InstallAgentBrowserToolUseCase {
  constructor(private readonly browserHost: BrowserHostPort) {}

  async execute(input: {
    orgId: string;
    hostId: string;
    version?: string;
  }): Promise<AgentBrowserToolInstallResult> {
    if (input.hostId !== LOCAL_HOST_ID) {
      throw new HttpException(
        400,
        'HOST_INSTALL_UNSUPPORTED',
        `tool install is only supported on ${LOCAL_HOST_ID} host in v1`,
      );
    }
    return await this.browserHost.installAgentBrowser(input.hostId, { version: input.version });
  }
}
