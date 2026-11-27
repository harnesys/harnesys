import { describe, expect, test } from 'bun:test';
import type { McpConnection, McpConnector } from '../application/mcp/mcp-connector.port.ts';
import { NOOP_LOGGER } from '../ports/logger.ts';
import { McpRegistry } from './mcp-registry.ts';

function liveConnection(serverId: string): McpConnection {
  return {
    serverId,
    listTools: async () => [],
    callTool: async () => ({}),
    listResources: async () => ({ resources: [] }),
    readResource: async () => ({ contents: [] }),
    close: async () => {},
  };
}

describe('McpRegistry start failures', () => {
  test('loadJson records the caught connect error per server and reload clears it on success', async () => {
    let fail = true;
    const connector: McpConnector = {
      connect: () =>
        fail
          ? Promise.reject(new Error('spawn npx ENOENT'))
          : Promise.resolve(liveConnection('files')),
    };
    const registry = new McpRegistry(connector, NOOP_LOGGER);
    await registry.loadJson({ mcpServers: { files: { command: 'npx' } } });
    expect(await registry.list()).toEqual([]);
    expect(registry.lastStartFailures()).toEqual({ files: 'spawn npx ENOENT' });
    fail = false;
    await registry.reload('files');
    expect(registry.lastStartFailures()).toEqual({});
    expect((await registry.list()).map((row) => row.serverId)).toEqual(['files']);
    await registry.closeAll();
  });

  test('non-error throws are stringified and forget drops the recorded failure', async () => {
    const connector: McpConnector = { connect: () => Promise.reject('HTTP 401 Unauthorized') };
    const registry = new McpRegistry(connector, NOOP_LOGGER);
    await registry.loadJson({ mcpServers: { api: { url: 'https://mcp.example.com/mcp' } } });
    expect(registry.lastStartFailures()).toEqual({ api: 'HTTP 401 Unauthorized' });
    await registry.forget('api');
    expect(registry.lastStartFailures()).toEqual({});
  });

  test('disabled entries start nothing and record no failure', async () => {
    let connects = 0;
    const connector: McpConnector = {
      connect: () => {
        connects += 1;
        return Promise.resolve(liveConnection('off'));
      },
    };
    const registry = new McpRegistry(connector, NOOP_LOGGER);
    await registry.loadJson({ mcpServers: { off: { command: 'npx', enabled: false } } });
    expect(connects).toBe(0);
    expect(registry.lastStartFailures()).toEqual({});
  });
});
