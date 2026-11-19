import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { AddonException } from '../../../domain/addons/errors.ts';
import { AddonCloudBackendPort } from '../../../domain/addons/ports/addon-cloud-backend.port.ts';
import type { AddonSourceKindView } from '../../../domain/addons/ports/addon-source-kinds.port.ts';
import { AddonSourceKindsPort } from '../../../domain/addons/ports/addon-source-kinds.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { MachineConfigPort } from '../../../domain/machine/machine-config.port.ts';
import { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import { AttachGitUseCase } from '../../source/attach-git.use-case.ts';
import { toPublicSource } from '../../source/to-public-source.ts';
import { AddonCloudMaterializer } from './addon-cloud.materializer.ts';
import { resolveAddonAccount } from './addon-source.helpers.ts';

export interface AttachAddonSourceRequest {
  orgId: string;
  addonId: string;
  sourceKindId: string;
  folderId: string;
  name?: string;
  accountId?: string;
}

@Injectable()
export class AttachAddonSourceUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly kinds: AddonSourceKindsPort,
    private readonly bindings: BindingRepositoryPort,
    private readonly machine: MachineConfigPort,
    private readonly materializer: AddonCloudMaterializer,
    private readonly backends: AddonCloudBackendPort,
    private readonly attachGit: AttachGitUseCase,
  ) {}

  async execute(request: AttachAddonSourceRequest): Promise<Source> {
    const row = this.orgAddons.find(request.orgId, request.addonId);
    if (!row?.enabled) {
      throw new AddonException('unavailable', 409, `add-on ${request.addonId} is not enabled`);
    }
    const kind = this.kinds.find(request.orgId, request.addonId, request.sourceKindId);
    if (!kind) {
      throw new AddonException(
        'not_found',
        404,
        `add-on ${request.addonId} declares no source kind '${request.sourceKindId}'`,
      );
    }
    const accountId = resolveAddonAccount({
      bindings: this.bindings,
      orgId: request.orgId,
      addonId: request.addonId,
      connection: kind.connection,
      accountId: request.accountId,
    });
    if (kind.mount === 'git') {
      return this.attachGitSource(request, kind, accountId);
    }
    return this.attachCloudSource(request, kind, accountId);
  }

  private async attachCloudSource(
    request: AttachAddonSourceRequest,
    kind: AddonSourceKindView,
    accountId: string | undefined,
  ): Promise<Source> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const hostId = this.machine.get().id;
    const remoteFolderId = request.folderId.trim() || 'root';
    const name = request.name?.trim() || kind.title;
    const distribution = {
      kind: 'addon-cloud' as const,
      addonId: request.addonId,
      sourceKindId: request.sourceKindId,
      ...(accountId === undefined ? {} : { accountId }),
      remoteFolderId,
    };
    this.sources.insert({
      id,
      orgId: request.orgId,
      name,
      distribution,
      uiVisibility: 'org',
      managed: false,
      createdAt: now,
      updatedAt: now,
    });
    const record = this.sources.findById(request.orgId, id);
    if (!record) {
      throw new AddonException('internal', 500, `source ${id} was not persisted`);
    }
    await this.materializer.materialize(record, hostId);
    return toPublicSource(this.sources.findById(request.orgId, id) ?? record);
  }

  private async attachGitSource(
    request: AttachAddonSourceRequest,
    kind: AddonSourceKindView,
    accountId: string | undefined,
  ): Promise<Source> {
    if (accountId === undefined) {
      throw new AddonException(
        'conflict',
        409,
        `source kind '${kind.id}' needs an account bound to its connection`,
      );
    }
    const backend = this.backends.create({
      orgId: request.orgId,
      addonId: request.addonId,
      sourceKindId: kind.id,
      accountId,
    });
    const entry = await backend.getMetadata(request.folderId.trim());
    const url = entry.url;
    if (url === undefined || !isHttpsUrl(url)) {
      throw new AddonException(
        'invalid_params',
        400,
        `entry '${request.folderId}' does not resolve to an HTTPS clone URL`,
      );
    }
    return this.attachGit.execute({
      orgId: request.orgId,
      url,
      name: request.name?.trim() || entry.name,
      hostId: this.machine.get().id,
      accountId,
    });
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
