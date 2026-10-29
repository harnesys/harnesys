import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Configuration, Injectable } from '@harnesys/brix';
import type { AppConfig } from '../../../config.schema.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

const HOME_DIR_NAME = '.harnesys';
const CONFIG_FILE = 'config.json';
const MACHINE_FILE = 'machine.json';
const MACHINE_DB_FILE = 'machine.db';
const IDENTITY_DB_FILE = 'identity.db';
const MARKETPLACES_DIR = 'marketplaces';
const ORGS_DIR = 'orgs';
const DATA_DIR = 'data';
const NODES_DIR = 'nodes';
const ORG_DB_FILE = 'org.db';
const WORKSPACE_DIR = 'workspace';
const SOURCES_DIR = 'sources';
const SKILLS_DIR = 'skills';
const SETTINGS_FILE = 'settings.json';
const SKILLS_STAGING_DIR = 'skills-staging';
const MCP_CONFIG_FILE = 'mcp.json';
const PLUGINS_DIR = 'plugins';
const PLUGINS_DATA_DIR = 'plugins-data';
const LSP_CONFIG_FILE = 'lsp.json';
const THREADS_DIR = 'threads';
const DIR_MODE = 0o700;

function resolveHome(configured: string): string {
  const fromConfig = configured.trim();
  if (fromConfig) {
    return resolve(fromConfig);
  }
  return join(homedir(), HOME_DIR_NAME);
}

function assertSafeId(label: string, id: string): void {
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`invalid ${label}: ${id}`);
  }
}

function assertInside(root: string, candidate: string): void {
  const resolvedRoot = resolve(root) + sep;
  const resolved = resolve(candidate);
  if (resolved !== resolve(root) && !resolved.startsWith(resolvedRoot)) {
    throw new Error(`refusing path outside ${root}: ${candidate}`);
  }
}

@Injectable()
export class HostFsLayoutAdapter extends HostFsLayoutPort {
  private readonly root: string;

  constructor(@Configuration() config: AppConfig) {
    super();
    this.root = resolveHome(config.harnesys.home);
  }

  home(): string {
    return this.root;
  }

  configPath(): string {
    return join(this.root, CONFIG_FILE);
  }

  machinePath(): string {
    return join(this.root, MACHINE_FILE);
  }

  machineDbPath(): string {
    return join(this.root, MACHINE_DB_FILE);
  }

  identityDbPath(): string {
    return join(this.root, IDENTITY_DB_FILE);
  }

  marketplacesDir(): string {
    return join(this.root, MARKETPLACES_DIR);
  }

  marketplaceInstallPath(registryId: string): string {
    assertSafeId('registryId', registryId);
    return join(this.marketplacesDir(), registryId);
  }

  orgDir(orgId: string): string {
    assertSafeId('orgId', orgId);
    return join(this.root, ORGS_DIR, orgId);
  }

  orgDbPath(orgId: string): string {
    return join(this.orgDir(orgId), ORG_DB_FILE);
  }

  orgDataDir(orgId: string): string {
    assertSafeId('orgId', orgId);
    return join(this.root, DATA_DIR, ORGS_DIR, orgId);
  }

  orgWorkspacePath(orgId: string): string {
    return join(this.orgDataDir(orgId), WORKSPACE_DIR);
  }

  orgSourceDir(orgId: string, sourceId: string): string {
    assertSafeId('orgId', orgId);
    assertSafeId('sourceId', sourceId);
    return join(this.orgDataDir(orgId), SOURCES_DIR, sourceId);
  }

  sourceWorktreesDir(orgId: string, sourceId: string): string {
    assertSafeId('orgId', orgId);
    assertSafeId('sourceId', sourceId);
    return join(this.orgDataDir(orgId), SOURCES_DIR, `${sourceId}.worktrees`);
  }

  skillsDir(orgId: string): string {
    return join(this.orgDir(orgId), SKILLS_DIR);
  }

  systemSkillsDir(): string {
    return join(this.root, SKILLS_DIR);
  }

  hostAgentSkillsDir(): string {
    return join(homedir(), '.agents', SKILLS_DIR);
  }

  orgSettingsPath(orgId: string): string {
    assertSafeId('orgId', orgId);
    return join(this.orgDir(orgId), SETTINGS_FILE);
  }

  skillsStagingDir(orgId: string): string {
    return join(this.orgDataDir(orgId), SKILLS_STAGING_DIR);
  }

  mcpConfigPath(orgId: string): string {
    return join(this.orgDir(orgId), MCP_CONFIG_FILE);
  }

  pluginsDir(orgId: string): string {
    return join(this.orgDir(orgId), PLUGINS_DIR);
  }

  pluginsDataDir(orgId: string): string {
    return join(this.orgDir(orgId), PLUGINS_DATA_DIR);
  }

  lspConfigPath(orgId: string): string {
    return join(this.orgDir(orgId), LSP_CONFIG_FILE);
  }

  threadDir(orgId: string, threadId: string): string {
    assertSafeId('threadId', threadId);
    return join(this.orgDir(orgId), THREADS_DIR, threadId);
  }

  nodesDir(): string {
    return join(this.root, NODES_DIR);
  }

  nodeIdentityPath(orgId: string): string {
    assertSafeId('orgId', orgId);
    return join(this.nodesDir(), `${orgId}.json`);
  }

  ensureHome(): void {
    mkdirSync(this.root, { recursive: true, mode: DIR_MODE });
    chmodSync(this.root, DIR_MODE);
  }

  ensureMarketplacesDir(): string {
    this.ensureHome();
    const dir = this.marketplacesDir();
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
    return dir;
  }

  ensureOrgDir(orgId: string): void {
    this.ensureHome();
    const dir = this.orgDir(orgId);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
  }

  ensureOrgDataDir(orgId: string): void {
    this.ensureHome();
    const dir = this.orgDataDir(orgId);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
  }

  ensureOrgWorkspace(orgId: string): string {
    this.ensureOrgDataDir(orgId);
    const dir = this.orgWorkspacePath(orgId);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
    return dir;
  }

  ensureOrgSourceDir(orgId: string, sourceId: string): string {
    this.ensureOrgDataDir(orgId);
    const dir = this.orgSourceDir(orgId, sourceId);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
    return dir;
  }

  ensureSourceWorktreesDir(orgId: string, sourceId: string): string {
    this.ensureOrgDataDir(orgId);
    const dir = this.sourceWorktreesDir(orgId, sourceId);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
    return dir;
  }

  ensureSkillsDir(orgId: string): string {
    this.ensureOrgDir(orgId);
    const dir = this.skillsDir(orgId);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
    return dir;
  }

  ensurePluginsDir(orgId: string): string {
    this.ensureOrgDir(orgId);
    const dir = this.pluginsDir(orgId);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
    return dir;
  }

  ensureThreadDir(orgId: string, threadId: string): string {
    this.ensureOrgDir(orgId);
    const dir = this.threadDir(orgId, threadId);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
    return dir;
  }

  ensureNodesDir(): void {
    this.ensureHome();
    const dir = this.nodesDir();
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodSync(dir, DIR_MODE);
  }

  removeOrgDir(orgId: string): void {
    const dir = resolve(this.orgDir(orgId));
    assertInside(join(this.root, ORGS_DIR), dir);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  removeOrgDataDir(orgId: string): void {
    const dir = resolve(this.orgDataDir(orgId));
    assertInside(join(this.root, DATA_DIR, ORGS_DIR), dir);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
