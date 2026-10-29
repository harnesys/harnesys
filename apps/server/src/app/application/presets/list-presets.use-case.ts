import { Injectable } from '@harnesys/brix';
import type { ListPresetsQuery, ListPresetsResponse } from '@harnesys/contracts';
import { PresetCatalogPort } from '../../domain/presets/preset-catalog.port.ts';

@Injectable()
export class ListPresetsUseCase {
  constructor(private readonly catalog: PresetCatalogPort) {}

  execute(query: ListPresetsQuery): ListPresetsResponse {
    return {
      items: this.catalog.list({
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.origin === undefined ? {} : { origin: query.origin }),
      }),
    };
  }
}
