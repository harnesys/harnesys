import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { isSourceVisibleToSurface } from '../../domain/source/ui-visibility.policy.ts';
import { toPublicSource } from './to-public-source.ts';

export interface GetSourceInput {
  orgId: string;
  sourceId: string;
  surfaceHostId: string | null;
}

@Injectable()
export class GetSourceUseCase {
  constructor(private readonly sources: SourceRegistryPort) {}

  execute(input: GetSourceInput): Source {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row || !isSourceVisibleToSurface(row, input.surfaceHostId)) {
      throw new SourceNotFoundException(input.sourceId);
    }
    return toPublicSource(row);
  }
}
