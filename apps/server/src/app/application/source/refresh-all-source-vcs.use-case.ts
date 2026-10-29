import { Configuration, Injectable, Logger } from '@harnesys/brix';
import type { AppConfig } from '../../../config.schema.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { type SourceRecord, SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { ensureGitCredentialKey, gitCredentialUrl } from './git-credential-url.ts';
import { refreshSourceVcs, type SourceVcsRefresherDeps } from './refresh-source-vcs.ts';

@Injectable()
export class RefreshAllSourceVcsUseCase {
  private readonly log: Logger;

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly git: GitVcsPort,
    private readonly driver: SourceDriverPort,
    private readonly layout: HostFsLayoutPort,
    private readonly registry: IntegrationRegistryPort,
    @Configuration() private readonly config: AppConfig & { server?: { port?: number } },
    logger: Logger,
  ) {
    this.log = logger.child('refresh-all-source-vcs');
  }

  async execute(): Promise<void> {
    const deps = this.deps();
    for (const org of this.orgs.list()) {
      for (const source of this.sources.list(org.orgId)) {
        if (!this.eligible(source, deps.localHostId)) {
          continue;
        }
        const mat = this.materializations.find(org.orgId, source.id, deps.localHostId);
        if (mat?.state !== 'ready' || mat.localPath === null) {
          continue;
        }
        await this.refreshSource(org.orgId, source, deps);
      }
    }
  }

  private async refreshSource(
    orgId: string,
    source: SourceRecord,
    deps: SourceVcsRefresherDeps,
  ): Promise<void> {
    try {
      await this.healIntegrationCredential(orgId, source);
    } catch (error) {
      this.log.warn({ error, orgId, sourceId: source.id }, 'git credential helper setup failed');
    }
    try {
      await refreshSourceVcs(deps, orgId, source.id);
    } catch (error) {
      this.log.warn({ error, orgId, sourceId: source.id }, 'source vcs refresh failed');
    }
  }

  private async healIntegrationCredential(orgId: string, source: SourceRecord): Promise<void> {
    const integrationId = source.vcs?.integrationId;
    const remoteUrl = source.vcs?.remoteUrl;
    if (integrationId === undefined || integrationId === null || !remoteUrl) {
      return;
    }
    const key = ensureGitCredentialKey(this.registry, orgId, integrationId);
    if (!key) {
      return;
    }
    await this.driver.configureCredentialHelper({
      layout: {
        bareRepoPath: this.layout.orgSourceDir(orgId, source.id),
        worktreesRoot: this.layout.sourceWorktreesDir(orgId, source.id),
      },
      remoteUrl,
      credentialUrl: gitCredentialUrl(this.config, integrationId, key),
    });
  }

  private eligible(source: SourceRecord, localHostId: string): boolean {
    return source.distribution.kind === 'host-bound' && source.distribution.hostId === localHostId;
  }

  private deps(): SourceVcsRefresherDeps {
    return {
      sources: this.sources,
      materializations: this.materializations,
      git: this.git,
      localHostId: this.machineConfig.get().id,
    };
  }
}
