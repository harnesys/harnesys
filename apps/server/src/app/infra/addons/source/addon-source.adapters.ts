import { Injectable } from '@harnesys/brix';
import type { SourceKindDescriptor } from '@harnesys/sdk';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import type { AddonCloudBackendRef } from '../../../domain/addons/ports/addon-cloud-backend.port.ts';
import { AddonCloudBackendPort } from '../../../domain/addons/ports/addon-cloud-backend.port.ts';
import type { AddonSourceKindView } from '../../../domain/addons/ports/addon-source-kinds.port.ts';
import { AddonSourceKindsPort } from '../../../domain/addons/ports/addon-source-kinds.port.ts';
import type { CloudRemoteBackendPort } from '../../../domain/source/cloud-remote-backend.port.ts';
import { l10nText } from '../families/shared.ts';
import { AddonSourceKindRegistry } from '../families/source-kind/source-kind.family.ts';
import { AddonCloudBackend } from './addon-cloud.backend.ts';

@Injectable()
export class AddonSourceKindsAdapter extends AddonSourceKindsPort {
  constructor(private readonly registry: AddonSourceKindRegistry) {
    super();
  }

  override list(orgId: string): AddonSourceKindView[] {
    return this.registry.list(orgId).map((entry) => toView(entry.owner.addonId, entry.descriptor));
  }

  override find(orgId: string, addonId: string, id: string): AddonSourceKindView | undefined {
    const entry = this.registry.find(orgId, addonId, id);
    return entry ? toView(addonId, entry.descriptor) : undefined;
  }
}

@Injectable()
export class AddonCloudBackendAdapter extends AddonCloudBackendPort {
  constructor(private readonly calls: AddonCallPort) {
    super();
  }

  override create(ref: AddonCloudBackendRef): CloudRemoteBackendPort {
    return new AddonCloudBackend(this.calls, ref);
  }
}

function toView(addonId: string, descriptor: SourceKindDescriptor): AddonSourceKindView {
  return {
    addonId,
    id: descriptor.id,
    title: l10nText(descriptor.title),
    connection: descriptor.connection,
    ...(descriptor.supportsRootMount === undefined
      ? {}
      : { supportsRootMount: descriptor.supportsRootMount }),
    ...(descriptor.supportsSearch === undefined
      ? {}
      : { supportsSearch: descriptor.supportsSearch }),
    ...(descriptor.rootTitle === undefined ? {} : { rootTitle: descriptor.rootTitle }),
  };
}
