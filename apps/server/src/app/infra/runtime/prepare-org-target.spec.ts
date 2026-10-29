import { afterEach, describe, expect, test } from 'bun:test';
import type { AgentDefinition } from 'harnesys';
import { type BuildShellOpts, build, disposeBaseDir } from './prepare-org-target.fixtures.ts';
import { prepareTarget } from './prepare-org-target.ts';

afterEach(() => {
  disposeBaseDir();
});

function shellSpecOf(agentDef: AgentDefinition | undefined): Record<string, unknown> {
  const shell = agentDef?.packs?.shell;
  const spec =
    typeof shell === 'object' && shell !== null ? (shell as { spec?: unknown }).spec : undefined;
  return spec !== null && typeof spec === 'object' && !Array.isArray(spec)
    ? (spec as Record<string, unknown>)
    : {};
}

describe('prepareTarget runMode permissions', () => {
  test('stricter mode gates win over agent permissions', () => {
    const { deps, cache } = build('plan');
    const prepared = prepareTarget(deps, 'thread-1', cache);
    expect(prepared?.permissions['fs.write']).toBe('deny');
    expect(prepared?.permissions.process).toBe('deny');
  });

  test('thread without runMode keeps agent permissions', () => {
    const { deps, cache } = build(undefined);
    const prepared = prepareTarget(deps, 'thread-1', cache);
    expect(prepared?.permissions['fs.write']).toBe('allow');
    expect(prepared?.permissions.process).toBe('allow');
  });

  test('unknown runMode keeps agent permissions', () => {
    const { deps, cache, modes } = build('missing');
    modes.preset = undefined;
    const prepared = prepareTarget(deps, 'thread-1', cache);
    expect(prepared?.permissions['fs.write']).toBe('allow');
    expect(prepared?.permissions.process).toBe('allow');
  });
});

describe('prepareTarget runMode capability fields', () => {
  test('agent-local mode from modesJson wins, null packs dropped', () => {
    const { deps, cache } = build('local', {
      agentModes: [
        {
          id: 'local',
          name: 'Local',
          packs: { shell: true, files: null },
          disabledTools: ['web_fetch'],
          exposure: { web_search: 'deferred' },
        },
      ],
    });
    const prepared = prepareTarget(deps, 'thread-1', cache);
    expect(prepared?.mode).toEqual({
      id: 'local',
      packs: { shell: true },
      disabledTools: ['web_fetch'],
      exposure: { web_search: 'deferred' },
    });
  });

  test('falls back to the org preset when no agent-local mode matches', () => {
    const { deps, cache } = build('plan');
    const prepared = prepareTarget(deps, 'thread-1', cache);
    expect(prepared?.mode?.id).toBe('plan');
  });

  test('default runMode builds no capability fields', () => {
    const { deps, cache } = build('default');
    const prepared = prepareTarget(deps, 'thread-1', cache);
    expect(prepared?.mode).toBeUndefined();
  });

  test('unknown runMode and no default fallback builds no capability fields', () => {
    const { deps, cache, modes } = build('missing');
    modes.preset = undefined;
    const agent = deps.agents.findById(deps.orgId, 'agent-1');
    if (agent) {
      agent.defaultModeId = null;
    }
    const prepared = prepareTarget(deps, 'thread-1', cache);
    expect(prepared?.mode).toBeUndefined();
  });
});

describe('prepareTarget runMode shell spec', () => {
  test('preset blocklist merges under an empty agent shell spec', () => {
    const opts: BuildShellOpts = {
      agentShell: { spec: {} },
      presetShell: { spec: { blocklist: ['evil-tool *'] } },
    };
    const { deps, cache } = build('plan', opts);
    const prepared = prepareTarget(deps, 'thread-1', cache);
    expect(shellSpecOf(prepared?.agentDef).blocklist).toEqual(['evil-tool *']);
  });

  test('agent entries survive alongside preset entries', () => {
    const opts: BuildShellOpts = {
      agentShell: { spec: { allowlist: ['git status'], blocklist: ['agent-blocked *'] } },
      presetShell: { spec: { allowlist: ['bun *'], blocklist: ['evil-tool *'] } },
    };
    const { deps, cache } = build('plan', opts);
    const prepared = prepareTarget(deps, 'thread-1', cache);
    const spec = shellSpecOf(prepared?.agentDef);
    expect(spec.allowlist).toEqual(['git status', 'bun *']);
    expect(spec.blocklist).toEqual(['evil-tool *', 'agent-blocked *']);
  });
});
