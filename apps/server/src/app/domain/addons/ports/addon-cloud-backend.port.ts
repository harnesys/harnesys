import type { CloudRemoteBackendPort } from '../../source/cloud-remote-backend.port.ts';

export interface AddonCloudBackendRef {
  orgId: string;
  addonId: string;
  sourceKindId: string;
  accountId?: string;
}

/**
 * Creates a remote cloud backend proxy for a source-kind contribution of an
 * installed add-on. The add-on owns vendor auth and API calls; the core only
 * sees the abstract `CloudRemoteBackendPort` surface.
 */
export abstract class AddonCloudBackendPort {
  abstract create(ref: AddonCloudBackendRef): CloudRemoteBackendPort;
}
