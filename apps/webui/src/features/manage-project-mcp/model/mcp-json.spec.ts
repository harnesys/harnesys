import { describe, expect, test } from 'bun:test';
import { emptyMcpFields } from './mcp-fields';
import {
  mcpDraftToJson,
  mcpFieldsInputToJson,
  mcpJsonToFields,
  parseMcpJsonDraft,
} from './mcp-json';

describe('parseMcpJsonDraft', () => {
  test('parses stdio server', () => {
    const result = parseMcpJsonDraft(
      JSON.stringify({
        serverId: 'filesystem',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'server-filesystem', '.'],
        env: { DEBUG: '1' },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.draft).toEqual({
      serverId: 'filesystem',
      body: {
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'server-filesystem', '.'],
        env: { DEBUG: '1' },
      },
    });
  });

  test('rejects invalid JSON', () => {
    const result = parseMcpJsonDraft('{nope');
    expect(result.ok).toBe(false);
  });

  test('rejects stdio without command', () => {
    const result = parseMcpJsonDraft(
      JSON.stringify({ serverId: 'x', enabled: true, transport: 'stdio' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain('command');
  });

  test('rejects http without url', () => {
    const result = parseMcpJsonDraft(
      JSON.stringify({ serverId: 'x', enabled: true, transport: 'http' }),
    );
    expect(result.ok).toBe(false);
  });

  test('rejects mismatched locked server id', () => {
    const result = parseMcpJsonDraft(
      JSON.stringify({ serverId: 'other', enabled: true, transport: 'stdio', command: 'npx' }),
      'filesystem',
    );
    expect(result.ok).toBe(false);
  });

  test('parses cursor-style mcpServers wrapper', () => {
    const result = parseMcpJsonDraft(
      JSON.stringify({
        mcpServers: {
          'sequential-thinking': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.draft).toEqual({
      serverId: 'sequential-thinking',
      body: {
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      },
    });
  });

  test('parses bare claude-style map', () => {
    const result = parseMcpJsonDraft(
      JSON.stringify({
        playwright: { command: 'npx', args: ['@playwright/mcp@latest'] },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.draft.serverId).toBe('playwright');
    expect(result.draft.body.transport).toBe('stdio');
  });

  test('rejects wrapper with several servers', () => {
    const result = parseMcpJsonDraft(
      JSON.stringify({
        mcpServers: { a: { command: 'x' }, b: { command: 'y' } },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain('one by one');
  });

  test('rejects wrapper without servers', () => {
    expect(parseMcpJsonDraft(JSON.stringify({ mcpServers: {} })).ok).toBe(false);
  });
});

describe('json roundtrip', () => {
  test('fields survive form -> json -> fields', () => {
    const fields = {
      ...emptyMcpFields(),
      serverId: 'filesystem',
      command: 'npx',
      argsText: '-y\nserver-filesystem',
      envText: 'DEBUG=1',
    };
    const text = mcpFieldsInputToJson(fields);
    const parsed = parseMcpJsonDraft(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(mcpJsonToFields(parsed.json)).toEqual(fields);
  });

  test('draft serializes with serverId first', () => {
    const text = mcpDraftToJson({
      serverId: 'filesystem',
      body: { enabled: true, transport: 'stdio', command: 'npx' },
    });
    expect(text.startsWith('{\n  "serverId": "filesystem"')).toBe(true);
  });
});
