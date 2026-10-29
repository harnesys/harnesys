import type { DiscoveredHost, DiscoveryHostInfo, ScanResult } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type { DiscoveredHost, DiscoveryHostInfo, ScanResult };

export function scanLan(): Promise<DiscoveredHost[]> {
  return apiJson<ScanResult>('/api/discovery/scan', {
    method: 'POST',
    body: JSON.stringify({ mode: 'lan' }),
  }).then((result) => result.hosts);
}

export function scanRemote(ip: string): Promise<DiscoveredHost[]> {
  return apiJson<ScanResult>('/api/discovery/scan', {
    method: 'POST',
    body: JSON.stringify({ mode: 'remote', ip }),
  }).then((result) => result.hosts);
}

export interface PairWithRelayInput {
  relayUrl: string;
  inviteCode: string;
  nodeName: string;
  orgId: string;
}

export type PairResult =
  | { ok: true; nodeId: string; orgId: string }
  | { error: string; detail?: string };

export function pairWithRelay(input: PairWithRelayInput): Promise<PairResult> {
  return apiJson<PairResult>('/api/discovery/pair', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export const discoveryScanQuery = (params: { mode: 'lan' } | { mode: 'remote'; ip: string }) =>
  queryOptions({
    queryKey: ['discovery', 'scan', params] as const,
    queryFn: () => (params.mode === 'remote' ? scanRemote(params.ip) : scanLan()),
    staleTime: 5_000,
  });
