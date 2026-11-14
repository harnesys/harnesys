import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';

export class FakeLayout extends HostFsLayoutPort {
  readonly root = mkdtempSync(join(tmpdir(), 'addon-layout-'));

  private resolve(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  override home(): string {
    return this.root;
  }

  override configPath(): string {
    return this.resolve('config.json');
  }

  override machinePath(): string {
    return this.resolve('machine.json');
  }

  override machineDbPath(): string {
    return this.resolve('machine.db');
  }

  override identityDbPath(): string {
    return this.resolve('identity.db');
  }

  override marketplacesDir(): string {
    return this.resolve('marketplaces');
  }

  override marketplaceInstallPath(registryId: string): string {
    return this.resolve('marketplaces', registryId);
  }

  override orgDir(orgId: string): string {
    return this.resolve('orgs', orgId);
  }

  override orgDbPath(orgId: string): string {
    return this.resolve('orgs', orgId, 'org.db');
  }

  override orgDataDir(orgId: string): string {
    return this.resolve('data', 'orgs', orgId);
  }

  override orgWorkspacePath(orgId: string): string {
    return this.resolve('data', 'orgs', orgId, 'workspace');
  }

  override orgSourceDir(orgId: string, sourceId: string): string {
    return this.resolve('data', 'orgs', orgId, 'sources', sourceId);
  }

  override sourceWorktreesDir(orgId: string, sourceId: string): string {
    return this.resolve('data', 'orgs', orgId, `sources/${sourceId}.worktrees`);
  }

  override skillsDir(orgId: string): string {
    return this.resolve('orgs', orgId, 'skills');
  }

  override systemSkillsDir(): string {
    return this.resolve('skills');
  }

  override hostAgentSkillsDir(): string {
    return this.resolve('host-skills');
  }

  override orgSettingsPath(orgId: string): string {
    return this.resolve('orgs', orgId, 'settings.json');
  }

  override skillsStagingDir(orgId: string): string {
    return this.resolve('data', 'orgs', orgId, 'skills-staging');
  }

  override mcpConfigPath(orgId: string): string {
    return this.resolve('orgs', orgId, 'mcp.json');
  }

  override pluginsDir(orgId: string): string {
    return this.resolve('orgs', orgId, 'plugins');
  }

  override pluginsDataDir(orgId: string): string {
    return this.resolve('orgs', orgId, 'plugins-data');
  }

  override lspConfigPath(orgId: string): string {
    return this.resolve('orgs', orgId, 'lsp.json');
  }

  override threadDir(orgId: string, threadId: string): string {
    return this.resolve('orgs', orgId, 'threads', threadId);
  }

  override nodesDir(): string {
    return this.resolve('nodes');
  }

  override nodeIdentityPath(orgId: string): string {
    return this.resolve('nodes', `${orgId}.json`);
  }

  override ensureHome(): void {
    mkdirSync(this.root, { recursive: true });
  }

  override ensureMarketplacesDir(): string {
    mkdirSync(this.marketplacesDir(), { recursive: true });
    return this.marketplacesDir();
  }

  override ensureOrgDir(orgId: string): void {
    mkdirSync(this.orgDir(orgId), { recursive: true });
  }

  override ensureOrgDataDir(orgId: string): void {
    mkdirSync(this.orgDataDir(orgId), { recursive: true });
  }

  override ensureOrgWorkspace(orgId: string): string {
    mkdirSync(this.orgWorkspacePath(orgId), { recursive: true });
    return this.orgWorkspacePath(orgId);
  }

  override ensureOrgSourceDir(orgId: string, sourceId: string): string {
    mkdirSync(this.orgSourceDir(orgId, sourceId), { recursive: true });
    return this.orgSourceDir(orgId, sourceId);
  }

  override ensureSourceWorktreesDir(orgId: string, sourceId: string): string {
    mkdirSync(this.sourceWorktreesDir(orgId, sourceId), { recursive: true });
    return this.sourceWorktreesDir(orgId, sourceId);
  }

  override ensureSkillsDir(orgId: string): string {
    mkdirSync(this.skillsDir(orgId), { recursive: true });
    return this.skillsDir(orgId);
  }

  override ensurePluginsDir(orgId: string): string {
    mkdirSync(this.pluginsDir(orgId), { recursive: true });
    return this.pluginsDir(orgId);
  }

  override ensureThreadDir(orgId: string, threadId: string): string {
    mkdirSync(this.threadDir(orgId, threadId), { recursive: true });
    return this.threadDir(orgId, threadId);
  }

  override ensureNodesDir(): void {
    mkdirSync(this.nodesDir(), { recursive: true });
  }

  override removeOrgDir(orgId: string): void {
    rmSync(this.orgDir(orgId), { recursive: true, force: true });
  }

  override removeOrgDataDir(orgId: string): void {
    rmSync(this.orgDataDir(orgId), { recursive: true, force: true });
  }
}
