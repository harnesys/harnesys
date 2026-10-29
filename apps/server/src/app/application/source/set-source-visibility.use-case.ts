import { Injectable } from '@harnesys/brix';
import type { Source, UiVisibility } from '@harnesys/contracts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { toPublicSource } from './to-public-source.ts';

export interface SetSourceVisibilityInput {
  orgId: string;
  sourceId: string;
  uiVisibility: UiVisibility;
}

@Injectable()
export class SetSourceVisibilityUseCase {
  constructor(private readonly sources: SourceRegistryPort) {}

  execute(input: SetSourceVisibilityInput): Source {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    this.sources.updateVisibility(input.orgId, input.sourceId, input.uiVisibility);
    return toPublicSource({ ...row, uiVisibility: input.uiVisibility }, new Date().toISOString());
  }
}
