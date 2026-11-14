import { Injectable } from '@harnesys/brix';
import { AddonException } from '../../../domain/addons/errors.ts';
import { AddonCloudBackendPort } from '../../../domain/addons/ports/addon-cloud-backend.port.ts';
import { AddonSourceKindsPort } from '../../../domain/addons/ports/addon-source-kinds.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import type { CloudRemoteEntry } from '../../../domain/source/cloud-remote-backend.port.ts';
import { resolveAddonAccount } from './addon-source.helpers.ts';

export interface BrowseAddonCloudFolderRequest {
  orgId: string;
  addonId: string;
  sourceKindId: string;
  folderId?: string;
  accountId?: string;
}

@Injectable()
export class BrowseAddonCloudFolderUseCase {
  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly kinds: AddonSourceKindsPort,
    private readonly bindings: BindingRepositoryPort,
    private readonly backends: AddonCloudBackendPort,
  ) {}

  async execute(request: BrowseAddonCloudFolderRequest): Promise<CloudRemoteEntry[]> {
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
    const backend = this.backends.create({
      orgId: request.orgId,
      addonId: request.addonId,
      sourceKindId: request.sourceKindId,
      accountId,
    });
    const folderId = request.folderId?.trim() || 'root';
    return backend.listChildren(folderId);
  }
}
