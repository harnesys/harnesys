import { existsSync, readFileSync, statSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import type { InstallPluginBody } from '@harnesys/contracts';
import type { CatalogEntry } from 'harnesys/plugins-catalog';
import { findMarketplaceManifest, parseClaudeMarketplace } from 'harnesys/plugins-catalog';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  PluginNotFoundException,
  PluginValidationException,
} from '../../domain/plugin/plugin.error.ts';
import type { PluginRegistryRecord } from '../../domain/plugin/plugin-registries.port.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { clonePlugin, removePluginPath, resolveGitSource } from './plugin-git.ts';

export interface StagedInstallSource {
  dir: string;
  source: string;
  revision: string;
  registryId?: string;
  catalogPluginName?: string;
  cleanup?: () => Promise<void>;
}

const RENAMES_CHAIN_MAX = 10;

export async function stageInstallSource(
  body: InstallPluginBody,
  registries: PluginRegistriesPort,
  layout: HostFsLayoutPort,
  orgId: string,
): Promise<StagedInstallSource> {
  if (body.registryId !== undefined && body.pluginName !== undefined) {
    return await stageFromCatalog(body.registryId, body.pluginName, registries, layout, orgId);
  }
  const path = body.path?.trim();
  if (path !== undefined && path.length > 0) {
    return stageFromPath(path);
  }
  const source = body.source?.trim();
  if (source !== undefined && source.length > 0) {
    return await stageFromGit(source, body.ref, layout, orgId);
  }
  throw new PluginValidationException('Provide path (local directory) or source');
}

function stageFromPath(candidate: string): StagedInstallSource {
  const absolute = resolve(candidate);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new PluginValidationException(`plugin path is not a directory: ${absolute}`);
  }
  return { dir: absolute, source: absolute, revision: 'local' };
}

async function stageFromGit(
  source: string,
  ref: string | undefined,
  layout: HostFsLayoutPort,
  orgId: string,
): Promise<StagedInstallSource> {
  const requested = source;
  const url = resolveGitSource(stripRefSuffix(requested));
  return await cloneStaged(url, ref ?? refFromSuffix(requested), layout, orgId, url);
}

function stripRefSuffix(source: string): string {
  const hash = source.lastIndexOf('#');
  if (hash <= 0 || hash === source.length - 1) {
    return source;
  }
  return source.slice(0, hash);
}

function refFromSuffix(source: string): string | undefined {
  const hash = source.lastIndexOf('#');
  if (hash <= 0 || hash === source.length - 1) {
    return undefined;
  }
  return source.slice(hash + 1);
}

async function cloneStaged(
  url: string,
  ref: string | undefined,
  layout: HostFsLayoutPort,
  orgId: string,
  sourceLabel: string,
): Promise<StagedInstallSource> {
  const root = join(layout.ensurePluginsDir(orgId), '__staging');
  const dir = join(root, crypto.randomUUID().replace(/-/g, '').slice(0, 12));
  const { revision } = await clonePlugin({ source: url, dest: dir, ...(ref ? { ref } : {}) });
  return {
    dir,
    source: sourceLabel,
    revision,
    cleanup: async () => {
      await removePluginPath(dir);
    },
  };
}

async function stageFromCatalog(
  registryId: string,
  pluginName: string,
  registries: PluginRegistriesPort,
  layout: HostFsLayoutPort,
  orgId: string,
): Promise<StagedInstallSource> {
  const entry = findCatalogEntryWithRenames(registries, registryId, pluginName);
  if (entry === undefined) {
    throw new PluginNotFoundException(`catalog plugin not found: ${pluginName}`);
  }
  if (!entry.installable || entry.installSource === undefined) {
    throw new PluginValidationException(
      `plugin ${pluginName} is not installable: ${entry.unsupportedReason ?? 'unsupported source'}`,
    );
  }
  const registry = registries.findById(registryId);
  if (registry === undefined) {
    throw new PluginNotFoundException(`marketplace not found: ${registryId}`);
  }
  const source = entry.installSource;
  if (source.type === 'relative') {
    return await stageRelative(registry, entry, source);
  }
  if (source.type === 'github' || source.type === 'url' || source.type === 'git-subdir') {
    const url =
      source.type === 'github' ? `https://github.com/${source.repo}.git` : resolveUrl(source.url);
    const ref = source.ref ?? source.sha;
    const staged = await cloneStaged(url, ref, layout, orgId, url);
    const dir =
      source.type === 'git-subdir' ? resolveInsideRoot(staged.dir, source.path) : staged.dir;
    return {
      ...staged,
      dir,
      revision: ref ?? staged.revision,
      registryId,
      catalogPluginName: entry.pluginName,
    };
  }
  throw new PluginValidationException(`plugin source type "${source.type}" is not supported`);
}

async function stageRelative(
  registry: PluginRegistryRecord,
  entry: CatalogEntry,
  source: { type: 'relative'; path: string },
): Promise<StagedInstallSource> {
  const original = resolveInsideRoot(registry.path, source.path);
  const base = {
    source: `marketplace:${registry.name}:${entry.pluginName}`,
    revision: registry.revision ?? 'catalog',
    registryId: registry.id,
    catalogPluginName: entry.pluginName,
  };
  if (hasPluginLayout(original) || entry.raw === undefined) {
    return { dir: original, ...base };
  }
  const staged = await stageWithSynthesizedManifest(original, entry.raw);
  return { ...staged, ...base };
}

function hasPluginLayout(dir: string): boolean {
  return existsSync(join(dir, '.claude-plugin')) || existsSync(join(dir, 'plugin.json'));
}

export async function synthesizePluginManifest(
  dir: string,
  raw: Record<string, unknown>,
): Promise<void> {
  const manifest: Record<string, unknown> = {};
  for (const key of ['name', 'description', 'version', 'author']) {
    if (raw[key] !== undefined) {
      manifest[key] = raw[key];
    }
  }
  for (const key of ['lspServers', 'hooks', 'mcpServers']) {
    if (raw[key] !== undefined) {
      manifest[key] = raw[key];
    }
  }
  if (manifest.name === undefined) {
    manifest.name = basename(dir);
  }
  const manifestDir = join(dir, '.claude-plugin');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'plugin.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function stageWithSynthesizedManifest(
  original: string,
  raw: Record<string, unknown>,
): Promise<StagedInstallSource> {
  const temp = await mkdtemp(join(tmpdir(), 'plugin-stage-'));
  const dir = join(temp, basename(original));
  await mkdir(dirname(dir), { recursive: true });
  await cp(original, dir, { recursive: true });
  await synthesizePluginManifest(dir, raw);
  return {
    dir,
    source: original,
    revision: 'catalog',
    cleanup: async () => {
      await rm(temp, { recursive: true, force: true });
    },
  };
}

const ABSOLUTE_URL_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/|git@)/i;

function resolveUrl(url: string): string {
  const trimmed = url.trim();
  if (ABSOLUTE_URL_RE.test(trimmed)) {
    return trimmed;
  }
  return resolve(trimmed);
}

function resolveInsideRoot(root: string, relPath: string): string {
  const candidate = resolve(root, relPath);
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  if (candidate !== root && !candidate.startsWith(normalizedRoot)) {
    throw new PluginValidationException(`path escapes marketplace root: ${relPath}`);
  }
  if (!existsSync(candidate) || !statSync(candidate).isDirectory()) {
    throw new PluginValidationException(`plugin directory not found: ${candidate}`);
  }
  return candidate;
}

export function findCatalogEntryWithRenames(
  registries: PluginRegistriesPort,
  registryId: string,
  pluginName: string,
): CatalogEntry | undefined {
  const direct = registries.findCatalogEntry(registryId, pluginName);
  if (direct !== undefined) {
    return direct;
  }
  const registry = registries.findById(registryId);
  const renames = readMarketplaceRenames(registry);
  if (renames === undefined) {
    return undefined;
  }
  let current = pluginName;
  for (let hop = 0; hop < RENAMES_CHAIN_MAX; hop += 1) {
    const next = renames[current];
    if (next === undefined || next === null) {
      return undefined;
    }
    current = next;
    const entry = registries.findCatalogEntry(registryId, current);
    if (entry !== undefined) {
      return entry;
    }
  }
  return undefined;
}

function readMarketplaceRenames(
  registry: PluginRegistryRecord | undefined,
): Record<string, string | null> | undefined {
  if (registry === undefined || !existsSync(registry.path)) {
    return undefined;
  }
  const location = findMarketplaceManifest(registry.path);
  if (location === undefined) {
    return undefined;
  }
  try {
    const parsed = parseClaudeMarketplace(JSON.parse(readFileSync(location.manifestPath, 'utf8')), {
      rootHint: location.root,
    });
    return parsed.renames;
  } catch {
    return undefined;
  }
}
