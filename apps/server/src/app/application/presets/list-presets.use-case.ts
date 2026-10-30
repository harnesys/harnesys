import { Injectable } from '@harnesys/brix';
import type {
  ListPresetDetailsResponse,
  ListPresetsQuery,
  ListPresetsResponse,
} from '@harnesys/contracts';
import { PresetCatalogPort } from '../../domain/presets/preset-catalog.port.ts';

@Injectable()
export class ListPresetsUseCase {
  constructor(private readonly catalog: PresetCatalogPort) {}

  execute(query: ListPresetsQuery): ListPresetsResponse | ListPresetDetailsResponse {
    const filter = {
      ...(query.kind === undefined ? {} : { kind: query.kind }),
      ...(query.origin === undefined ? {} : { origin: query.origin }),
    };
    if (query.expand === 'body') {
      return { items: this.catalog.listDetailed(filter) };
    }
    return { items: this.catalog.list(filter) };
  }
}
