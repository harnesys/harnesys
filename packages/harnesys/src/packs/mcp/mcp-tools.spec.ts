import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { McpHealthReport, McpManagePort, McpServerEntry } from '../../ports/mcp-manage.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { createMcpTools } from './create-mcp-tools.ts';

const ctx = {} as ToolContext;

function scope(): CapabilityScope {
  return { orgId: 'org-1', agentId: 'agent-1', sourceIds: [], threadId: 'thread-1' };
}

interface UpsertCall {
  serverId: string;
  entry: McpServerEntry;
}

function port(health: McpHealthReport, calls: { upserts: UpsertCall[] }): McpManagePort {
  return {
    list: async () => [],
    upsert: async (_scope, serverId, entry) => {
      calls.upserts.push({ serverId, entry });
      return health;
    },
    remove: async () => {},
    setEnabled: async () => health,
    health: async () => health,
  };
}

function toolsOf(port: McpManagePort) {
  const tools = createMcpTools({
    mcp: port,
    resolveScope: scope,
  });
  const named = (name: string) => {
    const def = tools.find((t) => t.name === name);
    if (!def) {
      throw new Error(`${name} tool missing`);
    }
    return def;
  };
  return {
    list: named('mcp_list'),
    connect: named('mcp_connect'),
    check: named('mcp_check'),
    toggle: named('mcp_toggle'),
    remove: named('mcp_remove'),
  };
}

describe('mcp pack tools', () => {
  test('tools declare mcp_manage operation, not mcp (never filtered by mcpServers)', () => {
    const { list } = toolsOf(port({ serverId: 'x', connected: false, tools: [] }, { upserts: [] }));
    expect(list.operations).toEqual(['mcp_manage']);
    expect(list.operations?.includes('mcp')).toBe(false);
  });

  test('connect maps stdio fields and reports discovered tools', async () => {
    const calls: { upserts: UpsertCall[] } = { upserts: [] };
    const { connect } = toolsOf(
      port(
        { serverId: 'github', connected: true, tools: [{ name: 'gh__search', description: 's' }] },
        calls,
      ),
    );
    const out = (await connect.execute(
      {
        serverId: 'github',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: 't' },
      },
      ctx,
    )) as Record<string, unknown>;
    expect(out.connected).toBe(true);
    expect(out.toolCount).toBe(1);
    expect(calls.upserts[0]?.entry).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: 't' },
    });
  });

  test('connect maps url fields and sse type', async () => {
    const calls: { upserts: UpsertCall[] } = { upserts: [] };
    const { connect } = toolsOf(port({ serverId: 'docs', connected: true, tools: [] }, calls));
    await connect.execute({ serverId: 'docs', url: 'https://x/sse', type: 'sse' }, ctx);
    expect(calls.upserts[0]?.entry).toEqual({ url: 'https://x/sse', type: 'sse' });
  });

  test('connect rejects missing transport and bad serverId without upsert', async () => {
    const calls: { upserts: UpsertCall[] } = { upserts: [] };
    const { connect } = toolsOf(port({ serverId: 'x', connected: true, tools: [] }, calls));
    expect(await connect.execute({ serverId: 'x' }, ctx)).toEqual({
      error: 'either command (stdio) or url (http/sse) is required',
    });
    expect(await connect.execute({ serverId: 'bad id!', command: 'x' }, ctx)).toEqual({
      error: 'serverId must match [a-zA-Z0-9][a-zA-Z0-9_-]*',
    });
    expect(calls.upserts).toEqual([]);
  });

  test('toggle validates enabled boolean; remove and check pass serverId through', async () => {
    const health: McpHealthReport = { serverId: 's1', connected: true, tools: [] };
    const { toggle, remove, check } = toolsOf(port(health, { upserts: [] }));
    expect(await toggle.execute({ serverId: 's1', enabled: 'yes' }, ctx)).toEqual({
      error: 'enabled must be a boolean',
    });
    expect(await toggle.execute({ serverId: 's1', enabled: false }, ctx)).toMatchObject({
      connected: true,
      enabled: false,
    });
    expect(await remove.execute({ serverId: 's1' }, ctx)).toEqual({ removed: 's1' });
    expect(await check.execute({ serverId: 's1' }, ctx)).toMatchObject({ connected: true });
    expect(await check.execute({}, ctx)).toEqual({ error: 'serverId must be a non-empty string' });
  });

  test('check is compact by default and full on verbose', async () => {
    const health: McpHealthReport = {
      serverId: 's1',
      connected: true,
      tools: [
        { name: 'a__one', description: 'long description '.repeat(10) },
        { name: 'a__two', description: 'long description '.repeat(10) },
      ],
    };
    const { check } = toolsOf(port(health, { upserts: [] }));
    const compact = (await check.execute({ serverId: 's1' }, ctx)) as Record<string, unknown>;
    expect(compact.toolCount).toBe(2);
    expect(compact.toolNames).toEqual(['a__one', 'a__two']);
    expect(compact.tools).toBeUndefined();
    const verbose = (await check.execute({ serverId: 's1', verbose: true }, ctx)) as Record<
      string,
      unknown
    >;
    expect((verbose.tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual([
      'a__one',
      'a__two',
    ]);
  });
});
