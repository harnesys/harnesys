import { describe, expect, test } from 'bun:test';
import type { CapabilityScope, McpHealthReport, McpServerEntry, McpServerInfo } from 'harnesys';
import { OrgMcpPort } from '../../../domain/mcp/org-mcp.port.ts';
import { OrgMcpManagePort } from './org-mcp-manage.port.ts';

const scope: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  sourceIds: [],
  threadId: 'thread-1',
};

interface Deps {
  config: OrgMcpPort;
  live: McpServerInfo[];
  upserts: Array<{ serverId: string; body: unknown }>;
  removed: string[];
  toggles: Array<{ serverId: string; enabled: boolean }>;
  applies: Array<{ serverId: string; entry: McpServerEntry | null }>;
  bundleInvalidations: number;
}

function deps(servers: Array<Record<string, unknown>>, live: McpServerInfo[] = []): Deps {
  const state: Deps = {
    config: {} as OrgMcpPort,
    live,
    upserts: [],
    removed: [],
    toggles: [],
    applies: [],
    bundleInvalidations: 0,
  };
  state.config = {
    listConfig: () => ({ servers: servers as never }),
    upsert: (_orgId, serverId, body) => {
      state.upserts.push({ serverId, body });
      return servers[0] as never;
    },
    remove: (_orgId, serverId) => {
      state.removed.push(serverId);
    },
    setEnabled: (_orgId, serverId, enabled) => {
      state.toggles.push({ serverId, enabled });
      return { servers: servers as never };
    },
  } as OrgMcpPort;
  return state;
}

function port(
  state: Deps,
  probe?: (serverId: string, entry: McpServerEntry) => Promise<McpHealthReport>,
) {
  return new OrgMcpManagePort({
    orgId: 'org-1',
    config: state.config,
    listLive: () => Promise.resolve(state.live),
    invalidateBundle: () => {
      state.bundleInvalidations += 1;
    },
    apply: (serverId, entry) => {
      state.applies.push({ serverId, entry });
      return Promise.resolve();
    },
    ...(probe !== undefined ? { probe } : {}),
  });
}

const okProbe = (serverId: string): McpHealthReport => ({
  serverId,
  connected: true,
  tools: [{ name: `${serverId}__ping`, description: 'ping' }],
});

describe('OrgMcpManagePort', () => {
  test('upsert probes first, stores only on success, hot-applies to the live runtime', async () => {
    const state = deps([]);
    const manage = port(state, () => Promise.resolve(okProbe('docs')));
    const health = await manage.upsert(scope, 'docs', { command: 'npx', args: ['-y', 'x'] });
    expect(health.connected).toBe(true);
    expect(health.tools).toHaveLength(1);
    expect(state.upserts).toHaveLength(1);
    expect(state.applies).toEqual([
      { serverId: 'docs', entry: { command: 'npx', args: ['-y', 'x'] } },
    ]);
    expect(state.bundleInvalidations).toBe(1);
  });

  test('upsert refuses to store a broken server', async () => {
    const state = deps([]);
    const manage = port(state, () =>
      Promise.resolve({ serverId: 'bad', connected: false, tools: [], error: 'spawn failed' }),
    );
    await expect(manage.upsert(scope, 'bad', { command: 'nope' })).rejects.toThrow('spawn failed');
    expect(state.upserts).toHaveLength(0);
    expect(state.applies).toHaveLength(0);
  });

  test('upsert rejects disabled entries', async () => {
    const state = deps([]);
    const manage = port(state, () => Promise.resolve(okProbe('x')));
    await expect(manage.upsert(scope, 'x', { command: 'x', enabled: false })).rejects.toThrow(
      'mcp_connect stores enabled servers',
    );
    expect(state.upserts).toHaveLength(0);
  });

  test('remove and setEnabled write config and hot-apply', async () => {
    const state = deps([]);
    const manage = port(state, () => Promise.resolve(okProbe('s1')));
    await manage.remove(scope, 's1');
    await manage.setEnabled(scope, 's1', false);
    expect(state.removed).toEqual(['s1']);
    expect(state.toggles).toEqual([{ serverId: 's1', enabled: false }]);
    expect(state.applies).toEqual([
      { serverId: 's1', entry: null },
      { serverId: 's1', entry: null },
    ]);
  });

  test('setEnabled(true) hot-applies the stored entry and probes', async () => {
    const state = deps([
      {
        serverId: 's1',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        connected: false,
        toolCount: 0,
      },
    ]);
    const manage = port(state, () => Promise.resolve(okProbe('s1')));
    const health = await manage.setEnabled(scope, 's1', true);
    expect(health.connected).toBe(true);
    expect(state.applies).toEqual([{ serverId: 's1', entry: { command: 'npx' } }]);
  });

  test('setEnabled(false) reports disabled without probing', async () => {
    const state = deps([]);
    let probes = 0;
    const manage = port(state, () => {
      probes += 1;
      return Promise.resolve(okProbe('s1'));
    });
    const health = await manage.setEnabled(scope, 's1', false);
    expect(health).toEqual({ serverId: 's1', connected: false, tools: [], error: 'disabled' });
    expect(probes).toBe(0);
  });

  test('health of disabled server short-circuits; unknown server fails', async () => {
    const state = deps([
      {
        serverId: 'off',
        enabled: false,
        transport: 'stdio',
        command: 'npx',
        connected: false,
        toolCount: 0,
      },
    ]);
    const manage = port(state, () => Promise.resolve(okProbe('off')));
    expect(await manage.health(scope, 'off')).toEqual({
      serverId: 'off',
      connected: false,
      tools: [],
      error: 'disabled',
    });
    await expect(manage.health(scope, 'ghost')).rejects.toThrow('not configured');
  });

  test('list merges managed config with live status and live-only servers', async () => {
    const state = deps(
      [
        {
          serverId: 'docs',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
          connected: false,
          toolCount: 0,
        },
      ],
      [
        {
          serverId: 'docs',
          transport: 'stdio',
          connected: true,
          tools: [{ name: 'd__a', description: '' }],
          resources: [],
        },
        {
          serverId: 'plugin:x',
          transport: 'http',
          connected: true,
          tools: [{ name: 'p__b', description: '' }],
          resources: [],
        },
      ],
    );
    const overview = await port(state).list(scope);
    expect(overview).toHaveLength(2);
    const docs = overview.find((row) => row.serverId === 'docs');
    expect(docs).toMatchObject({ managed: true, enabled: true, connected: true, toolCount: 1 });
    const plugin = overview.find((row) => row.serverId === 'plugin:x');
    expect(plugin).toMatchObject({ managed: false, connected: true });
  });
});
