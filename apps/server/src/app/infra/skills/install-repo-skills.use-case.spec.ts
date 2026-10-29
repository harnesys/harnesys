import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SkillCandidate } from '@harnesys/contracts';
import type { CursorMcpJson } from 'harnesys';
import { FsSkillRegistry } from 'harnesys/adapters/node';
import type { AppConfig } from '../../../config.schema.ts';
import { DiscoverRepoSkillsUseCase } from '../../application/skills/discover-repo-skills.use-case.ts';
import { InstallRepoSkillsUseCase } from '../../application/skills/install-repo-skills.use-case.ts';
import { resolveSkillSelection } from '../../application/skills/skill-selection.ts';
import { UpdateInstalledSkillUseCase } from '../../application/skills/update-installed-skill.use-case.ts';
import {
  type PluginRuntimeBundle,
  PluginRuntimePort,
} from '../../domain/plugin/plugin-runtime.port.ts';
import {
  SkillConflictException,
  SkillValidationException,
} from '../../domain/skills/skills.error.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { HostFsLayoutAdapter } from '../fs-layout/host-fs-layout.adapter.ts';
import { OrgSkillsAdapter } from './org-skills.adapter.ts';

const ORG = 'o1';

let base: string;
let repo: string;
let layout: HostFsLayoutAdapter;
let skills: OrgSkillsAdapter;
let executor: FakeExecutor;
let events: FakeEvents;
let discover: DiscoverRepoSkillsUseCase;
let install: InstallRepoSkillsUseCase;
let update: UpdateInstalledSkillUseCase;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'install-skills-'));
  repo = join(base, 'repo');
  layout = new HostFsLayoutAdapter({ harnesys: { home: base } } as AppConfig);
  skills = new OrgSkillsAdapter(layout);
  executor = new FakeExecutor();
  events = new FakeEvents();
  const runtime = new FakePluginRuntime(layout);
  discover = new DiscoverRepoSkillsUseCase(layout);
  install = new InstallRepoSkillsUseCase(layout, skills, runtime, executor, events);
  update = new UpdateInstalledSkillUseCase(layout, skills, runtime, executor, events);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

class FakeExecutor extends LocalExecutorPort {
  invalidated: string[] = [];

  invalidateRuntime(orgId: string): Promise<void> {
    this.invalidated.push(orgId);
    return Promise.resolve();
  }

  lifecycle(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  events(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  sessionFor(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  send(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  compact = (): Promise<never> => Promise.reject(new Error('not used'));
  drainMessageQueue = (): Promise<never> => Promise.reject(new Error('not used'));
  steerMessageQueue(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  cancel(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  retry(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  truncateThreadFrom(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  removeThreadEvent(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  stream(): never {
    throw new Error('not used');
  }
  publishEvents(): Promise<void> {
    return Promise.resolve();
  }
  tickWaitTimers(): Promise<number> {
    return Promise.resolve(0);
  }
  countWaitingTimers(): Promise<number> {
    return Promise.resolve(0);
  }
  listMcpServers(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

class FakeEvents extends SkillsEventsPort {
  published: { orgId: string; name?: string }[] = [];

  publish(orgId: string, event: { kind: 'changed'; name?: string }): void {
    this.published.push({ orgId, name: event.name });
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

class FakePluginRuntime extends PluginRuntimePort {
  constructor(private readonly layout: HostFsLayoutAdapter) {
    super();
  }

  bundle(orgId: string): Promise<PluginRuntimeBundle> {
    const root = this.layout.skillsDir(orgId);
    const dirs = existsSync(root)
      ? readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => join(root, e.name))
      : [];
    return Promise.resolve(makeBundle(new FsSkillRegistry({ roots: [], skillDirs: dirs })));
  }

  invalidate(): void {}
}

function makeBundle(registry: FsSkillRegistry): PluginRuntimeBundle {
  return {
    entries: [],
    skills: registry,
    mcpJson: {} as CursorMcpJson,
    agents: [],
    lspServers: [],
  };
}

function git(cwd: string, args: string[]): void {
  const proc = Bun.spawnSync(['/usr/bin/git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${proc.stderr.toString()}`);
  }
}

function skillMd(dir: string, name: string, description: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`,
  );
}

function commit(message: string): string {
  git(repo, ['add', '.']);
  git(repo, ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-m', message]);
  const rev = Bun.spawnSync(['/usr/bin/git', 'rev-parse', 'HEAD'], { cwd: repo, stdout: 'pipe' });
  return rev.stdout.toString().trim();
}

function makeRepo(): string {
  mkdirSync(repo, { recursive: true });
  git(repo, ['init']);
  skillMd(join(repo, 'skills', 'alpha'), 'alpha', 'alpha skill');
  skillMd(join(repo, 'nested', 'skills', 'beta'), 'beta', 'beta skill');
  return commit('initial');
}

function orgDirNames(): string[] {
  const root = layout.skillsDir(ORG);
  return existsSync(root) ? readdirSync(root) : [];
}

describe('DiscoverRepoSkillsUseCase', () => {
  test('lists candidates with revision and outsideContainer flags', async () => {
    const revision = makeRepo();
    const res = await discover.execute({ orgId: ORG, body: { url: repo } });
    expect(res.revision).toBe(revision);
    const alpha = res.candidates.find((c) => c.name === 'alpha');
    expect(alpha?.subPath).toBe('skills/alpha');
    expect(alpha?.outsideContainer).toBe(false);
    const beta = res.candidates.find((c) => c.name === 'beta');
    expect(beta?.subPath).toBe('nested/skills/beta');
    expect(beta?.outsideContainer).toBe(true);
    expect(res.diagnostics).toEqual([]);
  });
});

describe('InstallRepoSkillsUseCase', () => {
  test('installs selections with sidecars and publishes events', async () => {
    const revision = makeRepo();
    const res = await install.execute({
      orgId: ORG,
      body: { url: repo, revision, selections: ['skills/alpha', 'nested/skills/beta'] },
    });
    expect(res.conflicts).toEqual([]);
    expect(res.installed.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
    const sidecar = skills.readSidecar(ORG, 'alpha');
    expect(sidecar?.url).toBe(repo);
    expect(sidecar?.revision).toBe(revision);
    expect(sidecar?.subPath).toBe('skills/alpha');
    expect(sidecar?.installedAt.length).toBeGreaterThan(0);
    expect(existsSync(join(layout.skillsDir(ORG), 'beta', 'SKILL.md'))).toBe(true);
    expect(executor.invalidated).toEqual([ORG]);
    expect(events.published.map((p) => p.name).sort()).toEqual(['alpha', 'beta']);
  });

  test('stale revision conflicts and writes nothing', async () => {
    makeRepo();
    const stale = '0'.repeat(40);
    let thrown: unknown;
    try {
      await install.execute({
        orgId: ORG,
        body: { url: repo, revision: stale, selections: ['skills/alpha'] },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SkillConflictException);
    expect(orgDirNames()).toEqual([]);
  });

  test('collision rolls back created dirs and reports conflicts', async () => {
    const revision = makeRepo();
    skillMd(join(layout.ensureSkillsDir(ORG), 'beta'), 'beta', 'existing beta');
    let thrown: unknown;
    try {
      await install.execute({
        orgId: ORG,
        body: { url: repo, revision, selections: ['skills/alpha', 'nested/skills/beta'] },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SkillConflictException);
    expect(orgDirNames()).toEqual(['beta']);
    expect(skills.readSidecar(ORG, 'alpha')).toBeUndefined();
  });

  test('unknown selection is a validation error', async () => {
    const revision = makeRepo();
    let thrown: unknown;
    try {
      await install.execute({
        orgId: ORG,
        body: { url: repo, revision, selections: ['skills/missing'] },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SkillValidationException);
  });
});

describe('UpdateInstalledSkillUseCase', () => {
  test('replaces contents and rewrites sidecar revision', async () => {
    const revision = makeRepo();
    await install.execute({
      orgId: ORG,
      body: { url: repo, revision, selections: ['skills/alpha'] },
    });
    writeFileSync(
      join(repo, 'skills', 'alpha', 'SKILL.md'),
      '---\nname: alpha\ndescription: alpha v2\n---\n\nNew body.\n',
    );
    const nextRevision = commit('update alpha');
    const res = await update.execute({ orgId: ORG, name: 'alpha' });
    expect(res.skill.name).toBe('alpha');
    expect(skills.readSidecar(ORG, 'alpha')?.revision).toBe(nextRevision);
    const md = readFileSync(join(layout.skillsDir(ORG), 'alpha', 'SKILL.md'), 'utf8');
    expect(md).toContain('alpha v2');
  });

  test('manual skill without sidecar is a validation error', async () => {
    skills.create(ORG, { name: 'manual', description: 'd', instructions: 'i' });
    let thrown: unknown;
    try {
      await update.execute({ orgId: ORG, name: 'manual' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SkillValidationException);
  });
});

describe('resolveSkillSelection', () => {
  const candidates: SkillCandidate[] = [
    { name: 'gamma', description: '', subPath: 'tools/gamma', outsideContainer: true },
    { name: 'delta', description: '', subPath: 'skills/delta', outsideContainer: false },
  ];

  test('basename match wins', () => {
    expect(resolveSkillSelection(candidates, 'delta')).toEqual({
      ok: true,
      subPath: 'skills/delta',
    });
  });

  test('frontmatter name fallback', () => {
    expect(resolveSkillSelection(candidates, 'gamma')).toEqual({
      ok: true,
      subPath: 'tools/gamma',
    });
  });

  test('exact subPath match', () => {
    expect(resolveSkillSelection(candidates, 'skills/delta')).toEqual({
      ok: true,
      subPath: 'skills/delta',
    });
  });

  test('path suffix match', () => {
    expect(resolveSkillSelection(candidates, '.cursor/tools/gamma')).toEqual({
      ok: true,
      subPath: 'tools/gamma',
    });
  });

  test('ambiguous and not-found', () => {
    const dup: SkillCandidate[] = [
      { name: 'x', description: '', subPath: 'a/x', outsideContainer: true },
      { name: 'x', description: '', subPath: 'b/x', outsideContainer: true },
    ];
    const ambiguous = resolveSkillSelection(dup, 'x');
    expect(ambiguous.ok).toBe(false);
    const notFound = resolveSkillSelection(candidates, 'nope');
    expect(notFound.ok).toBe(false);
  });
});
