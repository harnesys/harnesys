import { randomUUID } from 'node:crypto';
import { Configuration, Injectable } from '@harnesys/brix';
import type { PrepareGitSourceResponse } from '@harnesys/contracts';
import type { AppConfig } from '../../../config.schema.ts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { vaultStorageKey } from '../../domain/secret/vault-keys.ts';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import {
  SourceDriverMismatchException,
  SourceNotFoundException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceOperationGrantPort } from '../../domain/source/source-operation-grant.port.ts';
import { type SourceRecord, SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs, sourceHostAvailability } from '../../domain/source/vcs-capability.ts';
import { ensureGitCredentialKey, gitCredentialUrl } from './git-credential-url.ts';
import { materializeGitSourceOnHost } from './materialize-git-source.ts';

const GRANT_TTL_MS = 5 * 60_000;

export interface PrepareGitSourceInput {
  orgId: string;
  sourceId: string;
  hostId: string;
}

@Injectable()
export class PrepareGitSourceUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly grants: SourceOperationGrantPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly driver: SourceDriverPort,
    private readonly nodes: NodeRepository,
    private readonly commands: NodeCommandQueuePort,
    private readonly hub: FleetHubPort,
    private readonly revisions: OrgConfigRevisionPort,
    private readonly materializationEvents: MaterializationEventsPort,
    private readonly secrets: SecretStorePort,
    private readonly registry: IntegrationRegistryPort,
    @Configuration() private readonly config: AppConfig & { server?: { port?: number } },
  ) {}

  async execute(input: PrepareGitSourceInput): Promise<PrepareGitSourceResponse> {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (!hasGitVcs(row)) {
      throw new SourceDriverMismatchException(input.sourceId, 'git', 'no-vcs');
    }
    const availability = sourceHostAvailability(row, input.hostId);
    if (!availability.allowed) {
      throw new SourceDriverMismatchException(input.sourceId, 'host', availability.reason);
    }
    const node = this.nodes.findById(input.orgId, input.hostId);
    if (!node) {
      throw new SourcePathInvalidException(`unknown host: ${input.hostId}`);
    }
    const existing = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    const existingProjection = this.materializations.findProjection(
      input.orgId,
      input.sourceId,
      input.hostId,
    );
    if (existing?.state === 'ready' || existingProjection?.state === 'ready') {
      const worktreeId = existing?.localPath ? basenameId(existing.localPath) : null;
      return {
        sourceId: input.sourceId,
        hostId: input.hostId,
        operationId: randomUUID(),
        state: 'ready',
        worktreeId,
      };
    }
    const operationId = randomUUID();
    const worktreeId = randomUUID();
    const sourceRevision = this.revisions.get(input.orgId).revision;
    const now = new Date().toISOString();
    const nextRevision = Math.max(existing?.revision ?? 0, existingProjection?.revision ?? 0) + 1;
    this.materializations.upsertProjection({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      state: 'materializing',
      revision: nextRevision,
      lastConfirmedAt: now,
      lastErrorCode: null,
      lastConflictPaths: [],
      refreshRequired: false,
    });
    this.materializationEvents.emit({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
    });
    const localHostId = this.machineConfig.get().id;
    if (input.hostId === localHostId) {
      return this.materializeLocal(row, input, operationId, worktreeId);
    }
    if (!this.hub.hasPeer(input.hostId)) {
      throw new HostOfflineException(input.hostId);
    }
    if (row.vcs?.credRef) {
      this.grants.create({
        operationId,
        orgId: input.orgId,
        nodeId: input.hostId,
        sourceId: input.sourceId,
        credRef: row.vcs.credRef,
        expiresAt: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
      });
    }
    const command: WorkerCommand = {
      type: 'SOURCE_MATERIALIZE',
      operationId,
      sourceId: input.sourceId,
      sourceRevision,
      projectionRevision: nextRevision,
      worktreeId,
    };
    this.commands.enqueue(input.orgId, input.hostId, command);
    this.hub.routeCommand(input.hostId, command);
    return {
      sourceId: input.sourceId,
      hostId: input.hostId,
      operationId,
      state: 'materializing',
      worktreeId,
    };
  }

  private gitCredentialUrl(orgId: string, integrationId: string): string | undefined {
    const key = ensureGitCredentialKey(this.registry, orgId, integrationId);
    if (!key) {
      return undefined;
    }
    return gitCredentialUrl(this.config, integrationId, key);
  }

  private async materializeLocal(
    row: SourceRecord,
    input: PrepareGitSourceInput,
    operationId: string,
    worktreeId: string,
  ): Promise<PrepareGitSourceResponse> {
    const result = await materializeGitSourceOnHost({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      url: row.vcs?.remoteUrl ?? '',
      branch: row.vcs?.defaultBranch ?? undefined,
      worktreeId,
      layout: this.layout,
      driver: this.driver,
      materializations: this.materializations,
      resolveCredential: async (credRef) => {
        const direct = await this.secrets.get(input.orgId, credRef);
        if (direct !== null) {
          return direct;
        }
        return this.secrets.get(input.orgId, vaultStorageKey('secret', credRef));
      },
      credRef: row.vcs?.credRef ?? undefined,
      integrationId: row.vcs?.integrationId ?? undefined,
      integrationCredentialUrl:
        row.vcs?.integrationId !== undefined && row.vcs.integrationId !== null
          ? this.gitCredentialUrl(input.orgId, row.vcs.integrationId)
          : undefined,
    });
    this.materializations.upsertProjection({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      state: result.state,
      revision: result.revision,
      lastConfirmedAt: new Date().toISOString(),
      lastErrorCode: result.errorCode ?? null,
      lastConflictPaths: [],
      refreshRequired: false,
    });
    this.materializationEvents.emit({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
    });
    return {
      sourceId: input.sourceId,
      hostId: input.hostId,
      operationId,
      state: result.state,
      worktreeId: result.worktreeId,
    };
  }
}

function basenameId(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
