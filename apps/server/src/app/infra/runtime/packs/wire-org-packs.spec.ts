import { describe, expect, test } from 'bun:test';
import type { OrgSettings } from '@harnesys/contracts';
import { OrgSettingsSchema } from '@harnesys/contracts';
import type { McpManagePort } from 'harnesys';
import type { LspPort } from '../../../domain/lsp/lsp.port.ts';
import type { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import type { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';
import type { OrgGithubDeps } from './org-github.port.ts';
import type { OrgGoogleDeps } from './org-google.port.ts';
import type { OrgIssueDeps } from './org-issue.port.ts';
import type { OrgManagerDeps } from './org-manager.port.ts';
import { isHostWired, orgPackNames } from './org-pack-list.ts';
import type { OrgSkillsDeps } from './org-skills.pack.port.ts';
import {
  FakeKnowledgeSearch,
  FakeKnowledgeStore,
  FakeSources,
  MemoryAgents,
  MemoryModels,
  MemoryProviders,
  MemorySchedules,
  MemoryThreads,
  MemoryWebhooks,
  memoryDb,
} from './wire-org-packs.fakes.ts';
import { type WireOrgPacksDeps, wireOrgPacks } from './wire-org-packs.ts';

const BASE_PACKS = ['core', 'files', 'shell', 'web', 'agents'];

class FakeOrgSettings extends OrgSettingsPort {
  get(): OrgSettings {
    return OrgSettingsSchema.parse({});
  }

  set(_orgId: string, patch: Partial<OrgSettings>): OrgSettings {
    return OrgSettingsSchema.parse(patch);
  }
}

function fullDeps(): WireOrgPacksDeps {
  const sources = new FakeSources();
  return {
    orgId: 'org-1',
    agents: new MemoryAgents(),
    providers: new MemoryProviders(),
    models: new MemoryModels(),
    threads: new MemoryThreads(),
    schedules: new MemorySchedules(),
    orgSettings: new FakeOrgSettings(),
    webhooks: new MemoryWebhooks(),
    issues: {} as OrgIssueDeps,
    manager: {} as OrgManagerDeps,
    google: {} as OrgGoogleDeps,
    github: {} as OrgGithubDeps,
    skills: {} as OrgSkillsDeps,
    mcpManage: {} as McpManagePort,
    lsp: {} as LspPort,
    secrets: {} as SecretStorePort,
    layout: {} as HostFsLayoutPort,
    knowledge: { search: new FakeKnowledgeSearch(), store: new FakeKnowledgeStore(), sources },
    sources,
    planDb: memoryDb(),
    memoryDb: memoryDb(),
  };
}

function baseDeps(): WireOrgPacksDeps {
  return {
    orgId: 'org-1',
    agents: new MemoryAgents(),
    providers: new MemoryProviders(),
    models: new MemoryModels(),
  };
}

function packNamesOf(deps: WireOrgPacksDeps): string[] {
  return wireOrgPacks(deps).registrations.map((registration) => registration.pack.name);
}

describe('wireOrgPacks', () => {
  test('full deps register exactly the host-wired pack set', () => {
    expect(packNamesOf(fullDeps())).toEqual(orgPackNames().filter((name) => isHostWired(name)));
  });

  test('minimal deps register only base wired packs without throwing', () => {
    const run = () => wireOrgPacks(baseDeps());
    expect(run).not.toThrow();
    expect(packNamesOf(baseDeps())).toEqual(BASE_PACKS);
  });
});
