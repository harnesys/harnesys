import { lookup } from 'node:dns/promises';

export interface EgressRule {
  hosts: string[];
  userHost?: { field: string; suffixes?: string[]; allowPrivate: boolean };
}

export type EgressVerdict = { allowed: true; url: URL } | { allowed: false };

export async function checkEgress(
  rule: EgressRule,
  userHost: string | null,
  rawUrl: string,
): Promise<EgressVerdict> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false };
  }
  const allowPrivate = rule.userHost?.allowPrivate === true;
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && allowPrivate && isLoopback(url.hostname))
  ) {
    return { allowed: false };
  }
  if (!hostAllowed(rule, userHost, url.hostname)) {
    return { allowed: false };
  }
  try {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0) {
      return { allowed: false };
    }
    if (!allowPrivate && addresses.some((entry) => isPrivateAddress(entry.address))) {
      return { allowed: false };
    }
  } catch {
    return { allowed: false };
  }
  return { allowed: true, url };
}

function hostAllowed(rule: EgressRule, userHost: string | null, hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (rule.hosts.some((pattern) => matchHost(pattern, host))) {
    return true;
  }
  if (!rule.userHost || !userHost) {
    return false;
  }
  let candidate = host;
  try {
    candidate = new URL(userHost).hostname.toLowerCase();
  } catch {
    if (rule.userHost.suffixes && rule.userHost.suffixes.length > 0) {
      return false;
    }
    candidate = userHost.toLowerCase();
  }
  if (candidate !== host) {
    return false;
  }
  const suffixes = rule.userHost.suffixes ?? [];
  return suffixes.length === 0 || suffixes.some((suffix) => host.endsWith(suffix.toLowerCase()));
}

function matchHost(pattern: string, host: string): boolean {
  const normalized = pattern.toLowerCase();
  if (normalized.startsWith('*.')) {
    return host.endsWith(normalized.slice(1)) || host === normalized.slice(2);
  }
  return host === normalized;
}

export function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    const lower = address.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    );
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
