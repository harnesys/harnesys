export type DiscoveryHostStatus = 'solo' | 'relay' | 'worker' | 'unknown';

export interface DiscoveryHostInfo {
  hostId: string;
  hostName: string;
  port: number;
  roles: DiscoveryHostStatus[];
  enrolledOrgIds: string[];
}

export interface DiscoveredHost {
  address: string;
  info: DiscoveryHostInfo;
  reachable: boolean;
}

export interface ScanRequest {
  mode: 'lan' | 'remote';
  ip?: string;
}

export interface ScanResult {
  hosts: DiscoveredHost[];
}
