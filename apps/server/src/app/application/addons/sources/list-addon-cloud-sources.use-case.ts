import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import { toPublicSource } from '../../source/to-public-source.ts';

export interface ListAddonCloudSourcesRequest {
  orgId: string;
  addonId: string;
}

@Injectable()
export class ListAddonCloudSourcesUseCase {
  constructor(private readonly sources: SourceRegistryPort) {}

  execute(request: ListAddonCloudSourcesRequest): Source[] {
    return this.sources
      .list(request.orgId)
      .filter(
        (row) =>
          row.distribution.kind === 'addon-cloud' && row.distribution.addonId === request.addonId,
      )
      .map((row) => toPublicSource(row));
  }
}
