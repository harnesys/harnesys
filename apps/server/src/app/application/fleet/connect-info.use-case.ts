import { networkInterfaces } from 'node:os';
import { Injectable } from '@harnesys/brix';
import type { ConnectInfo } from '@harnesys/contracts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { listenPortOf, relayUrlHint } from './relay-url-hint.ts';

@Injectable()
export class ConnectInfoUseCase {
  constructor(private readonly machineConfig: MachineConfigPort) {}

  execute(): ConnectInfo {
    const host = this.machineConfig.get();
    const listenPort = listenPortOf(host);
    const lanAddresses: string[] = [];
    for (const entries of Object.values(networkInterfaces())) {
      for (const entry of entries ?? []) {
        if (entry.family !== 'IPv4' || entry.internal) {
          continue;
        }
        if (!lanAddresses.includes(entry.address)) {
          lanAddresses.push(entry.address);
        }
      }
    }
    const publicOrigin = host.publicOrigin?.trim()
      ? host.publicOrigin.trim().replace(/\/+$/, '')
      : null;
    return {
      port: listenPort,
      publicOrigin,
      lanAddresses,
      relayUrlHint: relayUrlHint(host, listenPort),
    };
  }
}
