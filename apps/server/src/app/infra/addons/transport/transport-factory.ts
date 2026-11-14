import { Injectable } from '@harnesys/brix';
import { AddonTransportPort } from '../../../domain/addons/ports/addon-transport.port.ts';
import { NdjsonStdioTransport } from './ndjson-stdio.transport.ts';
import type { InProcessLaunchSpec } from './sdk-in-process-loader.ts';
import { InProcessAddonLoader } from './sdk-in-process-loader.ts';
import type { AddonLogSink, ChildHandle, SpawnedStdio } from './stdio-wiring.ts';

export interface SpawnedAddonProcess {
  readonly stdio: SpawnedStdio;
  readonly child: ChildHandle;
}

export interface LaunchedTransport {
  readonly transport: AddonTransportPort;
  readonly child: ChildHandle | null;
}

export interface TransportLogContext {
  readonly orgId: string;
  readonly addonId: string;
}

export abstract class TransportFactory {
  abstract forSpawned(
    spawned: SpawnedAddonProcess,
    context: TransportLogContext,
    sink: AddonLogSink,
  ): LaunchedTransport;
  abstract forInProcess(
    spec: InProcessLaunchSpec,
    context: TransportLogContext,
    sink: AddonLogSink,
  ): Promise<LaunchedTransport>;
}

@Injectable()
export class DefaultTransportFactory extends TransportFactory {
  constructor(private readonly loader: InProcessAddonLoader) {
    super();
  }

  forSpawned(
    spawned: SpawnedAddonProcess,
    context: TransportLogContext,
    sink: AddonLogSink,
  ): LaunchedTransport {
    const transport = new NdjsonStdioTransport({
      stdio: spawned.stdio,
      label: `${context.orgId}/${context.addonId}`,
      onStderr: (line) => sink.write(context.orgId, context.addonId, line),
      onOversize: (bytes) =>
        sink.write(context.orgId, context.addonId, `message exceeds ${bytes} bytes cap`),
    });
    return { transport, child: spawned.child };
  }

  async forInProcess(
    spec: InProcessLaunchSpec,
    context: TransportLogContext,
    sink: AddonLogSink,
  ): Promise<LaunchedTransport> {
    const endpoint = await this.loader.load(spec, (line) =>
      sink.write(context.orgId, context.addonId, line),
    );
    const transport = new NdjsonStdioTransport({
      stdio: { stdin: endpoint.stdin, stdout: endpoint.stdout, stderr: endpoint.stderr },
      label: `${context.orgId}/${context.addonId} (in-process)`,
      onStderr: (line) => sink.write(context.orgId, context.addonId, line),
      onOversize: (bytes) =>
        sink.write(context.orgId, context.addonId, `message exceeds ${bytes} bytes cap`),
    });
    return { transport, child: null };
  }
}
