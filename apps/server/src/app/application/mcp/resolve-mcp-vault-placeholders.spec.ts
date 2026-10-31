import { describe, expect, test } from 'bun:test';
import type { StdioEntry, UrlEntry } from 'harnesys';
import {
  type McpVaultLookup,
  resolveMcpVaultEntry,
  resolveMcpVaultJson,
} from './resolve-mcp-vault-placeholders.ts';

const ph = (ref: string): string => '$'.concat('{', ref, '}');

const LOOKUP: McpVaultLookup = (key) => {
  if (key === 'secret:GITHUB_TOKEN') {
    return Promise.resolve('gh_xxx');
  }
  return Promise.resolve(key === 'var:REGION' ? 'eu-1' : null);
};

describe('resolveMcpVaultEntry', () => {
  test('substitutes secret and var placeholders in env', async () => {
    const entry: StdioEntry = {
      command: 'node',
      env: { GITHUB_TOKEN: ph('secret:GITHUB_TOKEN'), REGION: ph('var:REGION') },
    };
    const result = (await resolveMcpVaultEntry('srv', entry, LOOKUP, () => {})) as StdioEntry;
    expect(result.env).toEqual({ GITHUB_TOKEN: 'gh_xxx', REGION: 'eu-1' });
  });

  test('substitutes headers and keeps url entries typed', async () => {
    const entry: UrlEntry = {
      url: 'https://mcp.example.com/sse',
      type: 'sse',
      headers: { Authorization: 'Bearer '.concat(ph('secret:GITHUB_TOKEN')) },
    };
    const result = (await resolveMcpVaultEntry('srv', entry, LOOKUP, () => {})) as UrlEntry;
    expect(result.headers).toEqual({ Authorization: 'Bearer gh_xxx' });
    expect(result.url).toBe('https://mcp.example.com/sse');
    expect(result.type).toBe('sse');
  });

  test('substitutes url, command, cwd and args', async () => {
    const urlEntry: UrlEntry = { url: 'https://'.concat(ph('var:REGION'), '.example.com') };
    const stdio: StdioEntry = {
      command: ph('secret:GITHUB_TOKEN'),
      cwd: '/opt/'.concat(ph('var:REGION')),
      args: ['--region='.concat(ph('var:REGION')), '--plain'],
    };
    const url = (await resolveMcpVaultEntry('srv', urlEntry, LOOKUP, () => {})) as UrlEntry;
    const result = (await resolveMcpVaultEntry('srv', stdio, LOOKUP, () => {})) as StdioEntry;
    expect(url.url).toBe('https://eu-1.example.com');
    expect(result.command).toBe('gh_xxx');
    expect(result.cwd).toBe('/opt/eu-1');
    expect(result.args).toEqual(['--region=eu-1', '--plain']);
  });

  test('missing vault key resolves to empty and warns', async () => {
    const warnings: string[] = [];
    const entry: StdioEntry = { command: 'node', env: { TOKEN: ph('secret:MISSING') } };
    const result = (await resolveMcpVaultEntry('srv', entry, LOOKUP, (m) =>
      warnings.push(m),
    )) as StdioEntry;
    expect(result.env).toEqual({ TOKEN: '' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('secret:MISSING');
  });

  test('values without placeholders pass through untouched', async () => {
    const odd = 'cost $'.concat('{100} and $', '{not-a-pattern');
    const entry: StdioEntry = { command: 'node server.js', env: { HOME: '/usr/local', ODD: odd } };
    const result = (await resolveMcpVaultEntry('srv', entry, LOOKUP, () => {})) as StdioEntry;
    expect(result.command).toBe('node server.js');
    expect(result.env).toEqual({ HOME: '/usr/local', ODD: odd });
  });

  test('multiple placeholders in one value all resolve', async () => {
    const entry: UrlEntry = {
      url: 'https://'.concat(ph('var:REGION'), '.example.com/', ph('var:REGION')),
    };
    const result = (await resolveMcpVaultEntry('srv', entry, LOOKUP, () => {})) as UrlEntry;
    expect(result.url).toBe('https://eu-1.example.com/eu-1');
  });

  test('preserves enabled and toolPrefix fields', async () => {
    const entry: StdioEntry = {
      command: 'node',
      enabled: false,
      toolPrefix: 'mcp__x__',
      env: { TOKEN: ph('secret:GITHUB_TOKEN') },
    };
    const result = (await resolveMcpVaultEntry('srv', entry, LOOKUP, () => {})) as StdioEntry;
    expect(result.enabled).toBe(false);
    expect(result.toolPrefix).toBe('mcp__x__');
  });
});

describe('resolveMcpVaultJson', () => {
  test('resolves every server entry', async () => {
    const result = await resolveMcpVaultJson(
      {
        mcpServers: {
          a: { command: 'n', env: { T: ph('secret:GITHUB_TOKEN') } },
          b: { url: 'https://x', headers: { H: ph('var:REGION') } },
        },
      },
      LOOKUP,
      () => {},
    );
    expect(result.mcpServers.a).toEqual({ command: 'n', env: { T: 'gh_xxx' } });
    expect(result.mcpServers.b).toEqual({ url: 'https://x', headers: { H: 'eu-1' } });
  });
});
