import { Injectable } from '@harnesys/brix';
import type { Source, UiVisibility } from '@harnesys/contracts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryEventsPort } from '../../domain/source/source-registry-events.port.ts';
import { toPublicSource } from './to-public-source.ts';

export interface SetSourceVisibilityInput {
  orgId: string;
  sourceId: string;
  uiVisibility: UiVisibility;
}

@Injectable()
export class SetSourceVisibilityUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly registryEvents: SourceRegistryEventsPort,
  ) {}

  execute(input: SetSourceVisibilityInput): Source {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    this.sources.updateVisibility(input.orgId, input.sourceId, input.uiVisibility);
    this.registryEvents.emit({ orgId: input.orgId, sourceId: input.sourceId });
    return toPublicSource({ ...row, uiVisibility: input.uiVisibility }, new Date().toISOString());
  }
}
