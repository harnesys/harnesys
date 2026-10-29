import { HttpException, Injectable } from '@harnesys/brix';
import { detectOsArch, type EngineVersionOption, engineSpecOf, listEngineVersions } from 'harnesys';
import { LOCAL_HOST_ID } from '../../../domain/browser/browser-host.port.ts';

@Injectable()
export class ListBrowserEngineVersionsUseCase {
  async execute(input: {
    orgId: string;
    hostId: string;
    engineId: string;
  }): Promise<{ versions: EngineVersionOption[] }> {
    if (input.hostId !== LOCAL_HOST_ID) {
      throw new HttpException(
        400,
        'HOST_INSTALL_UNSUPPORTED',
        `version listing is only supported on ${LOCAL_HOST_ID} host in v1`,
      );
    }
    const spec = engineSpecOf(input.engineId);
    if (spec === undefined) {
      throw new HttpException(404, 'ENGINE_NOT_FOUND', `unknown engine ${input.engineId}`);
    }
    if (spec.install === undefined) {
      throw new HttpException(
        400,
        'ENGINE_NOT_INSTALLABLE',
        `engine ${input.engineId} is a system browser and has no downloadable versions`,
      );
    }
    const versions = await listEngineVersions(spec, detectOsArch());
    return { versions };
  }
}
