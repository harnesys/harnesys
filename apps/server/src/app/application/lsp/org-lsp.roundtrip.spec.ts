import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { DeleteOrgLspServerUseCase } from './delete-org-lsp-server.use-case.ts';
import { GetOrgLspUseCase } from './get-org-lsp.use-case.ts';
import { PutOrgLspUseCase } from './put-org-lsp.use-case.ts';
import { UpsertOrgLspServerUseCase } from './upsert-org-lsp-server.use-case.ts';

const emptyPluginRuntime = Object.assign(Object.create(PluginRuntimePort.prototype), {
  bundle: async () => ({
    entries: [],
    skills: {},
    mcpJson: {},
    agents: [],
    lspServers: [],
  }),
}) as PluginRuntimePort;

const emptyPluginRegistry = Object.assign(Object.create(PluginRegistryPort.prototype), {
  approvals: () => [],
  listDisabledServers: () => [],
  setServerDisabled: () => undefined,
}) as PluginRegistryPort;

describe('org LSP file roundtrip', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('PUT then GET preserves typescript server', async () => {
    const home = mkdtempSync(join(tmpdir(), 'harnesys-lsp-'));
    dirs.push(home);
    const layout = createLayout(home);
    const put = new PutOrgLspUseCase(layout);
    const get = new GetOrgLspUseCase(layout, emptyPluginRuntime, emptyPluginRegistry);

    put.execute({
      orgId: 'org-1',
      body: {
        servers: {
          typescript: {
            command: 'typescript-language-server',
            args: ['--stdio'],
            extensionToLanguage: { '.ts': 'typescript' },
          },
        },
      },
    });

    const listed = await get.execute({ orgId: 'org-1' });
    expect(listed.servers).toHaveLength(1);
    expect(listed.servers[0]?.serverId).toBe('typescript');
    expect(listed.servers[0]?.command).toBe('typescript-language-server');
  });

  test('upsert writes the server entry and keeps existing ones', async () => {
    const home = mkdtempSync(join(tmpdir(), 'harnesys-lsp-'));
    dirs.push(home);
    const layout = createLayout(home);
    const put = new PutOrgLspUseCase(layout);
    const upsert = new UpsertOrgLspServerUseCase(layout, emptyPluginRuntime, emptyPluginRegistry);
    const get = new GetOrgLspUseCase(layout, emptyPluginRuntime, emptyPluginRegistry);

    put.execute({
      orgId: 'org-1',
      body: {
        servers: {
          yaml: {
            command: 'yaml-language-server',
            args: ['--stdio'],
            extensionToLanguage: { '.yaml': 'yaml' },
          },
        },
      },
    });

    await upsert.execute({
      orgId: 'org-1',
      serverId: 'python',
      body: {
        command: 'pyright-langserver',
        args: ['--stdio'],
        extensionToLanguage: { '.py': 'python' },
      },
    });

    const listed = await get.execute({ orgId: 'org-1' });
    const byId = new Map(listed.servers.map((server) => [server.serverId, server]));
    expect(byId.get('yaml')?.command).toBe('yaml-language-server');
    expect(byId.get('python')?.command).toBe('pyright-langserver');
    expect(byId.get('python')?.extensionToLanguage['.py']).toBe('python');
  });

  test('delete removes only its own entry', async () => {
    const home = mkdtempSync(join(tmpdir(), 'harnesys-lsp-'));
    dirs.push(home);
    const layout = createLayout(home);
    const upsert = new UpsertOrgLspServerUseCase(layout, emptyPluginRuntime, emptyPluginRegistry);
    const remove = new DeleteOrgLspServerUseCase(layout);
    const get = new GetOrgLspUseCase(layout, emptyPluginRuntime, emptyPluginRegistry);

    await upsert.execute({
      orgId: 'org-1',
      serverId: 'go',
      body: { command: 'gopls', extensionToLanguage: { '.go': 'go' } },
    });
    await remove.execute({ orgId: 'org-1', serverId: 'go' });

    const listed = await get.execute({ orgId: 'org-1' });
    expect(listed.servers).toHaveLength(0);
  });

  test('upsert and delete reject plugin-owned ids', async () => {
    const home = mkdtempSync(join(tmpdir(), 'harnesys-lsp-'));
    dirs.push(home);
    const layout = createLayout(home);
    const upsert = new UpsertOrgLspServerUseCase(layout, emptyPluginRuntime, emptyPluginRegistry);
    const remove = new DeleteOrgLspServerUseCase(layout);

    expect(
      upsert.execute({
        orgId: 'org-1',
        serverId: 'plugin:anthropic:typescript',
        body: { command: 'typescript-language-server' },
      }),
    ).rejects.toThrow('belongs to a plugin');
    expect(
      remove.execute({ orgId: 'org-1', serverId: 'plugin:anthropic:typescript' }),
    ).rejects.toThrow('belongs to a plugin');
  });

  test('upsert keeps the raw config shape on write', async () => {
    const home = mkdtempSync(join(tmpdir(), 'harnesys-lsp-'));
    dirs.push(home);
    const layout = createLayout(home);
    const upsert = new UpsertOrgLspServerUseCase(layout, emptyPluginRuntime, emptyPluginRegistry);
    const result = await upsert.execute({
      orgId: 'org-1',
      serverId: 'bad',
      body: { command: 'some-ls' },
    });
    expect(result.servers.some((server) => server.serverId === 'bad')).toBe(true);
    expect(result.raw).toMatchObject({
      bad: { command: 'some-ls', extensionToLanguage: {} },
    });
  });
});

function createLayout(home: string): HostFsLayoutPort {
  const layout: Pick<HostFsLayoutPort, 'ensureOrgDir' | 'lspConfigPath' | 'identityDbPath'> = {
    ensureOrgDir: (orgId) => {
      mkdirSync(join(home, 'orgs', orgId), { recursive: true });
    },
    lspConfigPath: (orgId) => join(home, 'orgs', orgId, 'lsp.json'),
    identityDbPath: () => join(home, 'identity.db'),
  };
  return layout as HostFsLayoutPort;
}
