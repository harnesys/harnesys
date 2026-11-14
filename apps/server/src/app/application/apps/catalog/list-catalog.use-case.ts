import { Injectable } from '@harnesys/brix';
import type { CatalogResponse } from '../../../domain/apps/descriptors.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';

@Injectable()
export class ListCatalogUseCase {
  constructor(private readonly registry: ProviderRegistryPort) {}

  execute(): CatalogResponse {
    return this.registry.catalog();
  }
}
