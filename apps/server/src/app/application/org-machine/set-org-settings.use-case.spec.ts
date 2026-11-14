import { describe, expect, test } from 'bun:test';
import type { ToolchainDiscovery } from '@harnesys/contracts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import type { ToolchainResolution } from '../../domain/toolchain/toolchain.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { FakeOrgSettings } from '../skills/org-settings.fakes.ts';
import { SetOrgSettingsUseCase } from './set-org-settings.use-case.ts';

const ORG_ID = 'org-1';

describe('SetOrgSettingsUseCase', () => {
  test('toolchain change invalidates toolchain and live LSP sessions', () => {
    const settings = new FakeOrgSettings();
    const toolchain = fakeToolchain();
    const lsp = fakeLsp();
    const useCase = new SetOrgSettingsUseCase(settings, toolchain, lsp);

    useCase.execute({
      orgId: ORG_ID,
      patch: {
        toolchain: {
          mode: 'custom',
          shell: 'auto',
          node: 'auto',
          extraPathDirs: ['/tmp/extra-bin'],
          commandOverrides: {},
        },
      },
    });

    expect(toolchain.invalidated).toEqual([ORG_ID]);
    expect(lsp.invalidatedOrgs).toEqual([ORG_ID]);
  });

  test('unrelated settings change does not invalidate toolchain', () => {
    const toolchain = fakeToolchain();
    const lsp = fakeLsp();
    const useCase = new SetOrgSettingsUseCase(new FakeOrgSettings(), toolchain, lsp);

    useCase.execute({ orgId: ORG_ID, patch: { timezone: 'UTC' } });

    expect(toolchain.invalidated).toEqual([]);
    expect(lsp.invalidatedOrgs).toEqual([]);
  });
});

class RecordingToolchain extends ToolchainPort {
  invalidated: string[] = [];

  override resolve(_orgId: string): ToolchainResolution {
    return { pathEnv: '', dirs: [] };
  }

  override hasBinary(_orgId: string, _command: string): boolean {
    return false;
  }

  override overrides(_orgId: string): Record<string, string> {
    return {};
  }

  override invalidate(orgId: string): void {
    this.invalidated.push(orgId);
  }

  override discover(_orgId: string, _commands: readonly string[]): Promise<ToolchainDiscovery> {
    return Promise.resolve({
      shells: [],
      nodeVersions: [],
      effectiveDirs: [],
      commands: [],
      mode: 'auto',
    });
  }
}

class RecordingLsp extends LspPort {
  invalidatedOrgs: string[] = [];

  override invalidateOrg(orgId: string): void {
    this.invalidatedOrgs.push(orgId);
  }

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

function fakeToolchain(): RecordingToolchain {
  return new RecordingToolchain();
}

function fakeLsp(): RecordingLsp {
  return new RecordingLsp();
}
