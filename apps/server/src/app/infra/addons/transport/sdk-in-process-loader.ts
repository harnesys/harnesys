import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { ResolvedAddonDefinition } from '@harnesys/sdk';
import { startAddonProcess } from '@harnesys/sdk';
import { createInProcessPair } from './in-process-wiring.ts';
import type { SpawnedStdio } from './stdio-wiring.ts';

export interface InProcessLaunchSpec {
  readonly orgId: string;
  readonly addonId: string;
  readonly version: string;
  readonly packageRoot: string;
  readonly entryPath: string;
  readonly dataDir: string;
}

export interface InProcessEndpoint extends SpawnedStdio {
  dispose(): void;
}

export abstract class InProcessAddonLoader {
  abstract load(
    spec: InProcessLaunchSpec,
    onStderr: (line: string) => void,
  ): Promise<InProcessEndpoint>;
}

export class InProcessLoadError extends Error {
  constructor(entryPath: string, cause: unknown) {
    super(`in-process addon entry could not be loaded: ${entryPath}`, { cause });
    this.name = new.target.name;
  }
}

@Injectable()
export class SdkInProcessAddonLoader extends InProcessAddonLoader {
  constructor(@Inject(Logger) private readonly logger: Logger) {
    super();
  }

  async load(
    spec: InProcessLaunchSpec,
    onStderr: (line: string) => void,
  ): Promise<InProcessEndpoint> {
    const pair = createInProcessPair(onStderr);
    let module: Record<string, unknown>;
    try {
      module = (await import(spec.entryPath)) as Record<string, unknown>;
    } catch (error) {
      pair.close();
      throw new InProcessLoadError(spec.entryPath, error);
    }
    const definition = module.addon as ResolvedAddonDefinition | undefined;
    if (!definition) {
      pair.close();
      throw new InProcessLoadError(
        spec.entryPath,
        new Error('entry module does not export `addon`'),
      );
    }
    void startAddonProcess({
      definition,
      addon: { id: spec.addonId, version: spec.version },
      wiring: pair.addonWiring,
    }).catch((error: unknown) => {
      this.logger.warn(
        { addonId: spec.addonId, error: String(error) },
        'in-process addon loop failed',
      );
      onStderr(`in-process addon loop failed: ${String(error)}\n`);
    });
    return {
      stdin: pair.hostSide.stdin,
      stdout: pair.hostSide.stdout,
      stderr: pair.hostSide.stderr,
      dispose(): void {
        pair.close();
      },
    };
  }
}
