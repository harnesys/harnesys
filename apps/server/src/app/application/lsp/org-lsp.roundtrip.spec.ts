import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@harnesys/brix';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { ApplyOrgLspPresetUseCase } from './apply-org-lsp-preset.use-case.ts';
import { GetOrgLspUseCase } from './get-org-lsp.use-case.ts';
import { PutOrgLspUseCase } from './put-org-lsp.use-case.ts';

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

  test('non-typescript preset returns 501', () => {
    const home = mkdtempSync(join(tmpdir(), 'harnesys-lsp-'));
    dirs.push(home);
    const layout = createLayout(home);
    const apply = new ApplyOrgLspPresetUseCase(layout);
    expect(() => apply.execute({ orgId: 'org-1', lang: 'python' })).toThrow(HttpException);
    try {
      apply.execute({ orgId: 'org-1', lang: 'python' });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).status).toBe(501);
      expect((err as HttpException).errorCode).toBe('LSP_PRESET_UNAVAILABLE');
    }
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
