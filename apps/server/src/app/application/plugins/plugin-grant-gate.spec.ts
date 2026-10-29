import { describe, expect, test } from 'bun:test';
import type { McpServerSpec, PluginComponent, PluginIr } from 'harnesys';
import { applyGrantGating } from './plugin-grant-gate.ts';

function irOf(components: PluginComponent[]): PluginIr {
  return {
    identity: { name: 'demo' },
    sourceFormat: 'claude-compat',
    components,
    grants: { needsProcess: true, needsNetwork: true },
    diagnostics: [],
  };
}

function mcpComponent(spec: McpServerSpec): PluginComponent {
  return {
    kind: 'mcp-server',
    spec,
    source: { file: 'plugin.json', pointer: `/mcpServers/${spec.serverId}` },
    status: 'native',
  };
}

describe('applyGrantGating', () => {
  test('stdio server without process grant is blocked_by_grant', () => {
    const gated = applyGrantGating(
      irOf([
        mcpComponent({ serverId: 'fs', config: { type: 'stdio', command: 'uvx', args: ['fs'] } }),
      ]),
      {},
      new Set(['fs']),
    );
    expect(gated.components[0]?.status).toBe('blocked_by_grant');
  });

  test('unapproved stdio server is blocked with needs_server_approval', () => {
    const gated = applyGrantGating(
      irOf([mcpComponent({ serverId: 'fs', config: { type: 'stdio', command: 'uvx' } })]),
      { process: true },
      new Set(),
    );
    expect(gated.components[0]?.status).toBe('blocked_by_grant');
    expect(gated.components[0]?.inertReason).toBe('needs_server_approval');
  });

  test('approved stdio server with process grant stays native', () => {
    const gated = applyGrantGating(
      irOf([mcpComponent({ serverId: 'fs', config: { type: 'stdio', command: 'uvx' } })]),
      { process: true },
      new Set(['fs']),
    );
    expect(gated.components[0]?.status).toBe('native');
  });

  test('url server needs network grant, not approval', () => {
    const gated = applyGrantGating(
      irOf([
        mcpComponent({
          serverId: 'web',
          config: { type: 'streamable-http', url: 'https://mcp.example.com' },
        }),
      ]),
      { network: true },
      new Set(),
    );
    expect(gated.components[0]?.status).toBe('native');
  });
});
