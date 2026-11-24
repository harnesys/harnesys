const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

export function hostMatches(host: string, allowlistEntry: string): boolean {
  const candidate = normalizeHost(host);
  const entry = normalizeHost(allowlistEntry);
  if (candidate === '' || entry === '') {
    return false;
  }
  if (entry.startsWith('*.')) {
    const suffix = entry.slice(1);
    return candidate.length > suffix.length && candidate.endsWith(suffix);
  }
  return candidate === entry;
}

export function hostAllowed(host: string, allowlist: readonly string[]): boolean {
  return allowlist.some((entry) => hostMatches(host, entry));
}

export function isIpLiteral(host: string): boolean {
  return IPV4_RE.test(normalizeHost(host)) || normalizeHost(host).includes(':');
}

function isPrivateV4(octets: readonly number[]): boolean {
  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  const value = normalizeHost(ip);
  const v4 = value.match(IPV4_RE);
  if (v4) {
    const octets = v4.slice(1).map((part) => Number.parseInt(part, 10));
    if (octets.some((octet) => octet > 255)) {
      return true;
    }
    return isPrivateV4(octets);
  }
  const expanded = expandIpv6(value);
  if (expanded === null) {
    return true;
  }
  if (
    expanded === '00000000000000000000000000000000' ||
    expanded === '00000000000000000000000000000001'
  ) {
    return true;
  }
  if (expanded.startsWith('00000000000000000000ffff')) {
    return isPrivateAddress(v4FromMapped(expanded));
  }
  const firstByte = expanded.slice(0, 2);
  const secondByte = expanded.slice(2, 4);
  return (
    firstByte === 'fc' ||
    firstByte === 'fd' ||
    firstByte === 'ff' ||
    (firstByte === 'fe' && secondByte >= '80' && secondByte <= 'bf')
  );
}

function v4FromMapped(expanded: string): string {
  const tail = expanded.slice(-8);
  const bytes = [0, 2, 4, 6].map((offset) => Number.parseInt(tail.slice(offset, offset + 2), 16));
  return bytes.join('.');
}

function expandTrailingV4(value: string): string | null {
  const lastColon = value.lastIndexOf(':');
  if (lastColon === -1 || !value.slice(lastColon + 1).includes('.')) {
    return value;
  }
  const octets = value.slice(lastColon + 1).split('.');
  if (octets.length !== 4) {
    return null;
  }
  const bytes = octets.map((part) => (/^\d{1,3}$/.test(part) ? Number.parseInt(part, 10) : -1));
  if (bytes.some((octet) => octet < 0 || octet > 255)) {
    return null;
  }
  const [a = 0, b = 0, c = 0, d = 0] = bytes;
  const high = ((a << 8) | b).toString(16);
  const low = ((c << 8) | d).toString(16);
  return `${value.slice(0, lastColon + 1)}${high}:${low}`;
}

function isValidIpv6Group(group: string | undefined): boolean {
  return group !== undefined && /^[0-9a-f]{1,4}$/.test(group);
}

function expandIpv6(value: string): string | null {
  if (!value.includes(':')) {
    return null;
  }
  const normalized = expandTrailingV4(value);
  if (normalized === null) {
    return null;
  }
  const sections = normalized.split('::');
  if (sections.length > 2) {
    return null;
  }
  const compressed = sections.length === 2;
  const head = (sections[0] ?? '').split(':').filter((part) => part !== '');
  const tail = compressed ? (sections[1] ?? '').split(':').filter((part) => part !== '') : [];
  const missing = 8 - head.length - tail.length;
  if (compressed && missing < 0) {
    return null;
  }
  const groups = compressed
    ? [...head, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tail]
    : head;
  if (groups.length !== 8 || !groups.every(isValidIpv6Group)) {
    return null;
  }
  return groups
    .map((group) => group.padStart(4, '0'))
    .join('')
    .toLowerCase();
}
