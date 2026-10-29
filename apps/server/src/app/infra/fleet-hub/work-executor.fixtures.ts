import { homedir } from 'node:os';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

export const fakeOrgId = 'org-1';

export class FakeLayout extends HostFsLayoutPort {
  home(): string {
    return '/tmp/harnesys-test';
  }
  configPath(): string {
    return '/tmp/harnesys-test/config.json';
  }
  machinePath(): string {
    return '/tmp/harnesys-test/machine.json';
  }
  machineDbPath(): string {
    return '/tmp/harnesys-test/machine.db';
  }
  identityDbPath(): string {
    return '/tmp/harnesys-test/identity.db';
  }
  marketplacesDir(): string {
    return '/tmp/harnesys-test/marketplaces';
  }
  marketplaceInstallPath(registryId: string): string {
    return `${this.marketplacesDir()}/${registryId}`;
  }
  orgDir(): string {
    return `/tmp/harnesys-test/${fakeOrgId}`;
  }
  orgDbPath(): string {
    return ':memory:';
  }
  orgDataDir(): string {
    return `${this.orgDir()}/data`;
  }
  orgWorkspacePath(): string {
    return `${this.orgDir()}/workspace`;
  }
  orgSourceDir(_org: string, sourceId: string): string {
    return `${this.orgDir()}/sources/${sourceId}`;
  }
  sourceWorktreesDir(_org: string, sourceId: string): string {
    return `${this.orgDir()}/sources/${sourceId}.worktrees`;
  }
  skillsDir(): string {
    return `${this.orgDir()}/skills`;
  }
  systemSkillsDir(): string {
    return '/tmp/harnesys-test/skills';
  }
  hostAgentSkillsDir(): string {
    return `${homedir()}/.agents/skills`;
  }
  orgSettingsPath(): string {
    return `${this.orgDir()}/settings.json`;
  }
  skillsStagingDir(): string {
    return `${this.orgDataDir()}/skills-staging`;
  }
  mcpConfigPath(): string {
    return `${this.orgDir()}/mcp.json`;
  }
  pluginsDir(): string {
    return `${this.orgDir()}/plugins`;
  }
  pluginsDataDir(): string {
    return `${this.orgDir()}/plugins-data`;
  }
  lspConfigPath(): string {
    return `${this.orgDir()}/lsp.json`;
  }
  threadDir(_org: string, tid: string): string {
    return `${this.orgDir()}/threads/${tid}`;
  }
  nodesDir(): string {
    return '/tmp/harnesys-test/nodes';
  }
  nodeIdentityPath(): string {
    return `${this.nodesDir()}/${fakeOrgId}.json`;
  }
  ensureHome(): void {}
  ensureMarketplacesDir(): string {
    return this.marketplacesDir();
  }
  ensureOrgDir(): void {}
  ensureOrgDataDir(): void {}
  ensureOrgWorkspace(): string {
    return this.orgWorkspacePath();
  }
  ensureOrgSourceDir(o: string, s: string): string {
    return this.orgSourceDir(o, s);
  }
  ensureSourceWorktreesDir(o: string, s: string): string {
    return this.sourceWorktreesDir(o, s);
  }
  ensureSkillsDir(): string {
    return this.skillsDir();
  }
  ensurePluginsDir(): string {
    return this.pluginsDir();
  }
  ensureThreadDir(o: string, tid: string): string {
    return this.threadDir(o, tid);
  }
  ensureNodesDir(): void {}
  removeOrgDir(): void {}
  removeOrgDataDir(): void {}
}
