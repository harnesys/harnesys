import { afterEach, describe, expect, test } from 'bun:test';
import { accessSync, constants, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OrgSettings, ToolchainDiscovery } from '@harnesys/contracts';
import { OrgSettingsSchema } from '@harnesys/contracts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import type { ToolchainResolution } from '../../domain/toolchain/toolchain.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { GetOrgLspUseCase } from '../lsp/get-org-lsp.use-case.ts';
import { PutOrgLspUseCase } from '../lsp/put-org-lsp.use-case.ts';
import { SetOrgSettingsUseCase } from '../org-machine/set-org-settings.use-case.ts';
import { FakeDeskEvents, FakeSchedules } from '../schedules/schedule.use-case.fakes.ts';

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

class DumbLsp extends LspPort {
  override invalidateOrg(_orgId: string): void {}
  override diagnostics(): Promise<never> {
    return Promise.reject(new Error('not implemented'));
  }
  override definition(): Promise<never> {
    return Promise.reject(new Error('not implemented'));
  }
  override references(): Promise<never> {
    return Promise.reject(new Error('not implemented'));
  }
  override hover(): Promise<never> {
    return Promise.reject(new Error('not implemented'));
  }
  override onDiagnostics(): () => void {
    return () => undefined;
  }
}

class MemoryOrgSettings extends OrgSettingsPort {
  private readonly store = new Map<string, OrgSettings>();

  override get(orgId: string): OrgSettings {
    return this.store.get(orgId) ?? OrgSettingsSchema.parse({});
  }

  override set(orgId: string, patch: Partial<OrgSettings>): OrgSettings {
    const next = OrgSettingsSchema.parse({ ...this.get(orgId), ...patch });
    this.store.set(orgId, next);
    return next;
  }
}

class StubbedToolchain extends ToolchainPort {
  constructor(
    private readonly settings: MemoryOrgSettings,
    private readonly managedDir: string,
  ) {
    super();
  }

  override resolve(_orgId: string): ToolchainResolution {
    const dirs = [...this.extraDirs(), this.managedDir];
    return { pathEnv: dirs.join(':'), dirs, nodeBin: undefined };
  }

  override hasBinary(orgId: string, command: string): boolean {
    return this.resolve(orgId).dirs.some((dir) => isExecutable(join(dir, command)));
  }

  override overrides(_orgId: string): Record<string, string> {
    return this.settings.get('org-1').toolchain.commandOverrides;
  }

  override invalidate(_orgId: string): void {}

  override async discover(orgId: string, commands: readonly string[]): Promise<ToolchainDiscovery> {
    return {
      shells: [],
      nodeVersions: [],
      effectiveDirs: this.resolve(orgId).dirs,
      commands: commands.map((command) => ({
        command,
        resolvedPath: null,
        source: 'missing' as const,
      })),
      mode: this.settings.get('org-1').toolchain.mode,
    };
  }

  private extraDirs(): string[] {
    return this.settings.get('org-1').toolchain.extraPathDirs;
  }
}

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

describe('toolchain settings roundtrip', () => {
  test('patching extraPathDirs flips binaryOk in the org LSP view', async () => {
    const home = mkdtempSync(join(tmpdir(), 'harnesys-roundtrip-'));
    dirs.push(home);
    const layout = createLayout(home);
    const settings = new MemoryOrgSettings();
    const toolchain = new StubbedToolchain(settings, join(home, 'managed-bin'));
    const setSettings = new SetOrgSettingsUseCase(
      settings,
      new FakeSchedules(),
      new FakeDeskEvents(),
      toolchain,
      new DumbLsp(),
    );
    const putOrgLsp = new PutOrgLspUseCase(layout, toolchain);
    const getOrgLsp = new GetOrgLspUseCase(
      layout,
      emptyPluginRuntime,
      emptyPluginRegistry,
      toolchain,
    );

    putOrgLsp.execute({
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

    const before = await getOrgLsp.execute({ orgId: 'org-1' });
    expect(before.servers[0]?.binaryOk).toBe(false);

    const stubDir = join(home, 'stub-bin');
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(join(stubDir, 'typescript-language-server'), '#!/bin/sh\n', { mode: 0o755 });

    setSettings.execute({
      orgId: 'org-1',
      patch: {
        toolchain: {
          mode: 'custom',
          shell: 'auto',
          node: 'auto',
          extraPathDirs: [stubDir],
          commandOverrides: {},
        },
      },
    });

    const after = await getOrgLsp.execute({ orgId: 'org-1' });
    expect(after.servers[0]?.binaryOk).toBe(true);
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
