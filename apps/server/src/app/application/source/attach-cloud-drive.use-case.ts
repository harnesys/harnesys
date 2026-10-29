import { Injectable } from '@harnesys/brix';
import type { Source, UiVisibility } from '@harnesys/contracts';
import {
  IntegrationNotConnectedException,
  IntegrationNotFoundException,
} from '../../domain/integration/integration.error.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { toPublicSource } from './to-public-source.ts';

export interface AttachCloudDriveInput {
  orgId: string;
  name?: string;
  backend?: 'google';
  remoteFolderId: string;
  integrationId: string;
  hostId?: string;
  uiVisibility?: UiVisibility;
}

@Injectable()
export class AttachCloudDriveUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly integrations: IntegrationRegistryPort,
  ) {}

  execute(input: AttachCloudDriveInput): Source {
    const backend = input.backend ?? 'google';
    if (backend !== 'google') {
      throw new SourcePathInvalidException(`Cloud backend ${backend} is not implemented yet`);
    }
    const integration = this.integrations.findById(input.orgId, input.integrationId);
    if (!integration) {
      throw new IntegrationNotFoundException(input.orgId, input.integrationId);
    }
    if (integration.status !== 'connected') {
      throw new IntegrationNotConnectedException(input.orgId, input.integrationId);
    }
    const remoteFolderId = input.remoteFolderId.trim() || 'root';
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const name = input.name?.trim() || 'Google Drive';
    const uiVisibility = input.uiVisibility ?? 'org';
    const distribution = {
      kind: 'cloud-drive' as const,
      backend: 'google' as const,
      remoteFolderId,
      integrationId: input.integrationId,
    };
    this.sources.insert({
      id,
      orgId: input.orgId,
      name,
      distribution,
      uiVisibility,
      managed: false,
      createdAt: now,
      updatedAt: now,
    });
    return toPublicSource({
      id,
      orgId: input.orgId,
      name,
      description: null,
      distribution,
      uiVisibility,
      managed: false,
      vcs: null,
      availability: { hostIds: [] },
      lspJson: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}
