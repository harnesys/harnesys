import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { OrgSkill } from '@harnesys/contracts';
import { type PluginComponent, parseSkillFile, type SkillSummary } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { LoadedOrgPlugin } from '../../domain/plugin/plugin-runtime.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';
import { type SourceSkillDir, SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { SkillsTierCache } from '../../infra/skills/skills-tier-cache.ts';
import {
  readSeedMarker,
  type SeedMarker,
  systemSkillUpdateAvailable,
} from '../../infra/skills/system-skills-seed.ts';

export interface MergedSkillsDeps {
  layout: HostFsLayoutPort;
  tierCache: SkillsTierCache;
  skills: OrgSkillsPort;
  pluginRuntime: PluginRuntimePort;
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
  sourceSkills: SourceSkillsPort;
  machine: MachineConfigPort;
  orgSettings: OrgSettingsPort;
}

export interface MergedSkillsOptions {
  sourceFilter?: (source: SourceRecord) => boolean;
}

const EMPTY_MARKER: SeedMarker = { appVersion: '', seededAt: '', skills: {} };

export async function buildMergedSkills(
  deps: MergedSkillsDeps,
  orgId: string,
  options?: MergedSkillsOptions,
): Promise<OrgSkill[]> {
  const tier = await tierSkills(deps);
  const org = deps.skills.list(orgId);
  const plugin = await pluginSkills(deps, orgId);
  const source = await sourceSkills(deps, orgId, options);
  return [...tier, ...org, ...plugin, ...source];
}

async function tierSkills(deps: MergedSkillsDeps): Promise<OrgSkill[]> {
  const entries = await deps.tierCache.entries();
  const systemDir = deps.layout.systemSkillsDir();
  const marker = readSeedMarker(systemDir) ?? EMPTY_MARKER;
  return entries.map((entry) => ({
    name: entry.summary.name,
    description: entry.summary.description,
    ...(entry.summary.whenToUse !== undefined ? { whenToUse: entry.summary.whenToUse } : {}),
    origin: entry.origin,
    path: entry.path,
    canDelete: false,
    canUpdate: false,
    loadable: true,
    ...(entry.origin.kind === 'system'
      ? { updateAvailable: systemSkillUpdateAvailable(systemDir, marker, entry.summary.name) }
      : {}),
  }));
}

async function pluginSkills(deps: MergedSkillsDeps, orgId: string): Promise<OrgSkill[]> {
  const bundle = await deps.pluginRuntime.bundle(orgId);
  const out: OrgSkill[] = [];
  for (const entry of bundle.entries) {
    const native = nativeSkillSummaries(entry.record.name, await bundle.skills.list());
    const seen = new Set<string>();
    for (const component of entry.ir.components) {
      const skill = pluginSkillOf(entry, component, seen, native);
      if (skill !== undefined) {
        out.push(skill);
      }
    }
  }
  return out;
}

function nativeSkillSummaries(
  pluginName: string,
  summaries: SkillSummary[],
): Map<string, SkillSummary> {
  const native = new Map<string, SkillSummary>();
  const prefix = `${pluginName}:`;
  for (const summary of summaries) {
    if (summary.name.startsWith(prefix)) {
      native.set(summary.name.slice(prefix.length), summary);
    }
  }
  return native;
}

function pluginSkillOf(
  entry: LoadedOrgPlugin,
  component: PluginComponent,
  seen: Set<string>,
  native: Map<string, SkillSummary>,
): OrgSkill | undefined {
  if (component.kind !== 'skill') {
    return undefined;
  }
  const spec = component.spec;
  if (!('name' in spec) || !('dir' in spec)) {
    return undefined;
  }
  const name = spec.name.length > 0 ? spec.name : basename(spec.dir);
  if (seen.has(name)) {
    return undefined;
  }
  seen.add(name);
  const summary = native.get(name) ?? tryParseSkillMd(spec.dir);
  if (summary === undefined) {
    return undefined;
  }
  return {
    name: summary.name,
    description: summary.description,
    ...(summary.whenToUse !== undefined ? { whenToUse: summary.whenToUse } : {}),
    origin: {
      kind: 'plugin',
      pluginName: entry.record.name,
      status: component.status,
      ...(component.inertReason !== undefined ? { inertReason: component.inertReason } : {}),
    },
    canDelete: false,
    canUpdate: false,
    loadable: component.status === 'native',
  };
}

async function sourceSkills(
  deps: MergedSkillsDeps,
  orgId: string,
  options?: MergedSkillsOptions,
): Promise<OrgSkill[]> {
  const autoLoad = deps.orgSettings.get(orgId).skillsSourceAutoLoad;
  const out: OrgSkill[] = [];
  for (const source of deps.sources.list(orgId)) {
    if (!sourceAllowed(source, options)) {
      continue;
    }
    const root = sourceSkillRoot(deps, orgId, source);
    if (root === '' || !existsSync(root)) {
      continue;
    }
    const scan = await deps.sourceSkills.scan(root);
    for (const dir of scan.skillDirs) {
      const skill = sourceSkillOf(source, dir, autoLoad);
      if (skill !== undefined) {
        out.push(skill);
      }
    }
  }
  return out;
}

function sourceAllowed(source: SourceRecord, options: MergedSkillsOptions | undefined): boolean {
  return options?.sourceFilter === undefined || options.sourceFilter(source);
}

function sourceSkillRoot(deps: MergedSkillsDeps, orgId: string, source: SourceRecord): string {
  try {
    return deps.sourceLocation.resolve({
      orgId,
      sourceId: source.id,
      hostId: deps.machine.get().id,
    }).absoluteRoot;
  } catch {
    return '';
  }
}

function sourceSkillOf(
  source: SourceRecord,
  dir: SourceSkillDir,
  autoLoad: boolean,
): OrgSkill | undefined {
  const summary = tryParseSkillMd(dir.dir);
  if (summary === undefined) {
    return undefined;
  }
  return {
    name: summary.name,
    description: summary.description,
    ...(summary.whenToUse !== undefined ? { whenToUse: summary.whenToUse } : {}),
    origin: {
      kind: 'source',
      sourceId: source.id,
      sourceName: source.name,
      relativePath: dir.relativePath,
      outsideContainer: dir.outsideContainer,
    },
    path: dir.dir,
    canDelete: false,
    canUpdate: false,
    loadable: autoLoad,
  };
}

function tryParseSkillMd(dir: string): SkillSummary | undefined {
  const file = join(dir, 'SKILL.md');
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const doc = parseSkillFile(readFileSync(file, 'utf8'), file);
    return {
      name: doc.name,
      description: doc.description,
      ...(doc.whenToUse !== undefined ? { whenToUse: doc.whenToUse } : {}),
    };
  } catch {
    return undefined;
  }
}
