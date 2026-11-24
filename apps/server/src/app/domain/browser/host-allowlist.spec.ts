import { describe, expect, test } from 'bun:test';
import {
  hostAllowed,
  hostMatches,
  isIpLiteral,
  isPrivateAddress,
  normalizeHost,
} from './host-allowlist.ts';

describe('hostMatches', () => {
  test('exact match always allowed', () => {
    expect(hostMatches('Example.COM.', 'example.com')).toBe(true);
  });

  test('wildcard matches subdomains at the label boundary', () => {
    expect(hostMatches('a.example.com', '*.example.com')).toBe(true);
    expect(hostMatches('deep.a.example.com', '*.example.com')).toBe(true);
  });

  test('wildcard never matches the bare domain or lookalikes', () => {
    expect(hostMatches('example.com', '*.example.com')).toBe(false);
    expect(hostMatches('example.com.evil.com', '*.example.com')).toBe(false);
    expect(hostMatches('notexample.com', '*.example.com')).toBe(false);
  });

  test('empty inputs never match', () => {
    expect(hostMatches('', 'example.com')).toBe(false);
    expect(hostMatches('example.com', '')).toBe(false);
  });
});

describe('hostAllowed', () => {
  test('checks the whole allowlist', () => {
    expect(hostAllowed('api.example.com', ['example.org', '*.example.com'])).toBe(true);
    expect(hostAllowed('evil.com', ['example.org', '*.example.com'])).toBe(false);
  });
});

describe('isIpLiteral', () => {
  test('detects IPv4 and IPv6 literals', () => {
    expect(isIpLiteral('127.0.0.1')).toBe(true);
    expect(isIpLiteral('::1')).toBe(true);
    expect(isIpLiteral('fe80::1')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
  });
});

describe('isPrivateAddress', () => {
  test('denies private and loopback IPv4 ranges', () => {
    for (const ip of [
      '0.1.2.3',
      '10.0.0.5',
      '127.0.0.1',
      '169.254.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1',
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  test('allows public IPv4', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '192.169.0.1']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  test('denies IPv6 loopback, unique-local, link-local, and unspecified', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  test('denies IPv4-mapped private ranges', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('normalizeHost', () => {
  test('lowercases and strips the trailing dot', () => {
    expect(normalizeHost('EXAMPLE.com.')).toBe('example.com');
  });
});
