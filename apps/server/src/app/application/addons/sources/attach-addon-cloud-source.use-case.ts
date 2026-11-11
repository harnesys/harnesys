import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { AddonException } from '../../../domain/addons/errors.ts';
import { AddonSourceKindsPort } from '../../../domain/addons/ports/addon-source-kinds.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { MachineConfigPort } from '../../../domain/machine/machine-config.port.ts';
import { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import { toPublicSource } from '../../source/to-public-source.ts';
import { AddonCloudMaterializer } from './addon-cloud.materializer.ts';
import { resolveAddonAccount } from './addon-source.helpers.ts';

export interface AttachAddonCloudSourceRequest {
  orgId: string;
  addonId: string;
  sourceKindId: string;
  folderId: string;
  name?: string;
  accountId?: string;
}

@Injectable()
export class AttachAddonCloudSourceUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly kinds: AddonSourceKindsPort,
    private readonly bindings: BindingRepositoryPort,
    private readonly machine: MachineConfigPort,
    private readonly materializer: AddonCloudMaterializer,
  ) {}

  async execute(request: AttachAddonCloudSourceRequest): Promise<Source> {
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
}
