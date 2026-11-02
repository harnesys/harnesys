import { describe, expect, test } from 'bun:test';
import type { ToolchainDiscovery } from '@harnesys/contracts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import type { ScheduleRecord } from '../../domain/schedule/schedule.ts';
import type { ToolchainResolution } from '../../domain/toolchain/toolchain.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import {
  FakeDeskEvents,
  FakeOrgSettings,
  FakeSchedules,
} from '../schedules/schedule.use-case.fakes.ts';
import { SetOrgSettingsUseCase } from './set-org-settings.use-case.ts';

const ORG_ID = 'org-1';

function schedule(id: string, cron: string, nextRunAt: string | null): ScheduleRecord {
  return {
    id,
    orgId: ORG_ID,
    name: id,
    status: 'active',
    targetAgentId: 'agent-1',
    detail: '',
    cron,
    modeId: 'default',
    history: 'none',
    historyLast: 1,
    missPolicy: 'catch-up',
    threadId: 'thread-1',
    nextRunAt,
    lastFiredAt: null,
    createdByUserId: null,
    createdAt: '2026-10-21T00:00:00.000Z',
    updatedAt: '2026-10-21T00:00:00.000Z',
  };
}

describe('SetOrgSettingsUseCase', () => {
  test('timezone change reschedules existing schedules in the new zone', () => {
    const settings = new FakeOrgSettings();
    const schedules = new FakeSchedules();
    schedules.items.set('s-1', schedule('s-1', '0 9 * * *', '2026-10-22T09:00:00.000Z'));
    const useCase = new SetOrgSettingsUseCase(
      settings,
      schedules,
      new FakeDeskEvents(),
      fakeToolchain(),
      fakeLsp(),
    );

    useCase.execute({ orgId: ORG_ID, patch: { timezone: 'Europe/Moscow' } });

    const next = schedules.items.get('s-1')?.nextRunAt ?? null;
    expect(next).not.toBeNull();
    expect(new Date(next ?? '').getUTCHours()).toBe(6);
  });

  test('other settings change leaves schedules untouched', () => {
    const settings = new FakeOrgSettings();
    const schedules = new FakeSchedules();
    schedules.items.set('s-1', schedule('s-1', '0 9 * * *', '2026-10-22T09:00:00.000Z'));
    const useCase = new SetOrgSettingsUseCase(
      settings,
      schedules,
      new FakeDeskEvents(),
      fakeToolchain(),
      fakeLsp(),
    );

    useCase.execute({ orgId: ORG_ID, patch: { skillsSourceAutoLoad: false } });

    expect(schedules.items.get('s-1')?.nextRunAt).toBe('2026-10-22T09:00:00.000Z');
  });

  test('toolchain change invalidates toolchain and live LSP sessions', () => {
    const settings = new FakeOrgSettings();
    const toolchain = fakeToolchain();
    const lsp = fakeLsp();
    const useCase = new SetOrgSettingsUseCase(
      settings,
      new FakeSchedules(),
      new FakeDeskEvents(),
      toolchain,
      lsp,
    );

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
    const useCase = new SetOrgSettingsUseCase(
      new FakeOrgSettings(),
      new FakeSchedules(),
      new FakeDeskEvents(),
      toolchain,
      lsp,
    );

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
