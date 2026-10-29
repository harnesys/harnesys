import { HttpException, Injectable } from '@harnesys/brix';
import { engineSpecOf } from 'harnesys';
import type { BrowserInstallProgress } from '../../../domain/browser/browser-host.port.ts';
import { BrowserHostPort, LOCAL_HOST_ID } from '../../../domain/browser/browser-host.port.ts';

@Injectable()
export class InstallBrowserEngineUseCase {
  constructor(private readonly browserHost: BrowserHostPort) {}

  async execute(
    input: { orgId: string; hostId: string; engine: string; stealth: boolean; version?: string },
    onProgress: (progress: BrowserInstallProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (input.hostId !== LOCAL_HOST_ID) {
      throw new HttpException(
        400,
        'HOST_INSTALL_UNSUPPORTED',
        `engine install is only supported on ${LOCAL_HOST_ID} host in v1`,
      );
    }
    if (engineSpecOf(input.engine) === undefined) {
      throw new HttpException(404, 'ENGINE_NOT_FOUND', `unknown engine ${input.engine}`);
    }
    await this.browserHost.install({
      hostId: input.hostId,
      engineId: input.engine,
      stealth: input.stealth,
      version: input.version,
      onProgress,
      signal,
    });
  }
}
