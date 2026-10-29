export interface HostConfig {
  id: string;
  name: string;
  listen: string;
  token: string;
  publicOrigin?: string;
}

export abstract class MachineConfigPort {
  abstract get(): HostConfig;
  abstract set(host: HostConfig): void;
}
