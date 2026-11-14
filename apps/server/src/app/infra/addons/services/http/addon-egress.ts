import { lookup } from 'node:dns/promises';
import { AddonError } from '@harnesys/sdk';
import { isPrivateAddress } from '../../../../infra/http/egress-guard.ts';
import { hostMatchesPattern } from '../../dispatcher/permission-definitions.ts';

export interface DnsEntry {
  address: string;
}

export function evaluateAddonEgress(
  url: URL,
  allowedHosts: readonly string[] | null,
  addresses: readonly DnsEntry[],
): void {
  if (url.protocol !== 'https:') {
    throw new AddonError('permission_denied', { detail: 'only https URLs are allowed' });
  }
  if (allowedHosts !== null && !hostCovered(url.hostname.toLowerCase(), allowedHosts)) {
    throw new AddonError('permission_denied', {
      detail: `host ${url.hostname} is not covered by the http.fetch grant scope`,
    });
  }
  if (addresses.length === 0) {
    throw new AddonError('unavailable', { detail: 'dns resolution failed' });
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new AddonError('permission_denied', { detail: 'private network addresses are blocked' });
  }
}

export async function resolveAddonEgress(
  url: URL,
  allowedHosts: readonly string[] | null,
): Promise<void> {
  const addresses = await lookup(url.hostname, { all: true }).catch(() => [] as DnsEntry[]);
  evaluateAddonEgress(url, allowedHosts, addresses);
}

function hostCovered(host: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => hostMatchesPattern(host, pattern));
}
