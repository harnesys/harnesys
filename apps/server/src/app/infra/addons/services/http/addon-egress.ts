import { lookup } from 'node:dns/promises';
import { AddonError } from '@harnesys/sdk';
import { isPrivateAddress } from '../../../../infra/http/egress-guard.ts';
import { hostMatchesPattern } from '../../dispatcher/permission-definitions.ts';

export interface DnsEntry {
  address: string;
}

export interface AddonEgressOptions {
  /** The org grant explicitly admits plain http and private/internal network addresses. */
  allowHttp?: boolean;
}

export function evaluateAddonEgress(
  url: URL,
  allowedHosts: readonly string[] | null,
  addresses: readonly DnsEntry[],
  options: AddonEgressOptions = {},
): void {
  if (url.protocol !== 'https:' && !options.allowHttp) {
    throw new AddonError('permission_denied', {
      detail: 'only https URLs are allowed; grant http.fetch with allowHttp for insecure URLs',
    });
  }
  if (allowedHosts !== null && !hostCovered(url.hostname.toLowerCase(), allowedHosts)) {
    throw new AddonError('permission_denied', {
      detail: `host ${url.hostname} is not covered by the http.fetch grant scope`,
    });
  }
  if (addresses.length === 0) {
    throw new AddonError('unavailable', { detail: 'dns resolution failed' });
  }
  if (!options.allowHttp && addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new AddonError('permission_denied', { detail: 'private network addresses are blocked' });
  }
}

export async function resolveAddonEgress(
  url: URL,
  allowedHosts: readonly string[] | null,
  options: AddonEgressOptions = {},
): Promise<void> {
  const addresses = await lookup(url.hostname, { all: true }).catch(() => [] as DnsEntry[]);
  evaluateAddonEgress(url, allowedHosts, addresses, options);
}

function hostCovered(host: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => hostMatchesPattern(host, pattern));
}
