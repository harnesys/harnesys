import { describe, expect, test } from 'bun:test';
import packageJson from '../package.json' with { type: 'json' };
import { CLI_VERSION, parseArgs, USAGE } from './index.ts';

describe('parseArgs', () => {
  test('help flags', () => {
    expect(parseArgs(['--help']).mode).toBe('help');
    expect(parseArgs(['help']).mode).toBe('help');
    expect(parseArgs([]).mode).toBe('help');
    expect(parseArgs(['login', 'http://relay:47474']).mode).toBe('login');
    expect(parseArgs(['login', 'http://relay:47474']).relayUrl).toBe('http://relay:47474');
    expect(parseArgs(['login']).mode).toBe('login');
    expect(parseArgs(['owner', 'init']).mode).toBe('owner-init');
    expect(USAGE).toContain('harnesys login <relayUrl>');
    expect(USAGE).toContain('harnesys owner init');
  });
  test('version flags', () => {
    expect(parseArgs(['--version']).mode).toBe('version');
    expect(parseArgs(['-V']).mode).toBe('version');
  });
  test('unknown', () => {
    expect(parseArgs(['enroll']).mode).toBe('unknown');
    expect(parseArgs(['owner', 'other']).mode).toBe('unknown');
    expect(parseArgs(['owner', 'other']).detail).toBe('owner other');
  });
  test('host invite', () => {
    const args = parseArgs(['host', 'invite', '--org', 'o1', '--name', 'n1', '--ttl', '20']);
    expect(args.mode).toBe('host-invite');
    expect(args.orgId).toBe('o1');
    expect(args.name).toBe('n1');
    expect(args.ttlMin).toBe(20);
  });
  test('host enroll', () => {
    const args = parseArgs([
      'host',
      'enroll',
      'http://relay:47474',
      'ABCD2345',
      '--org',
      'o1',
      '--name',
      'laptop',
    ]);
    expect(args.mode).toBe('host-enroll');
    expect(args.relayUrl).toBe('http://relay:47474');
    expect(args.code).toBe('ABCD2345');
    expect(args.orgId).toBe('o1');
  });
  test('host doctor', () => {
    expect(parseArgs(['host', 'doctor']).mode).toBe('host-doctor');
  });
});

describe('CLI_VERSION', () => {
  test('matches package.json', () => {
    expect(CLI_VERSION).toBe(packageJson.version);
  });
});
