import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { toPublicSource } from './to-public-source.ts';

export interface SetSourceAvailabilityInput {
  orgId: string;
  sourceId: string;
  hostIds: string[];
}

@Injectable()
export class SetSourceAvailabilityUseCase {
  constructor(private readonly sources: SourceRegistryPort) {}

  execute(input: SetSourceAvailabilityInput): Source {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    const availability = { hostIds: [...new Set(input.hostIds)] };
    this.sources.updateAvailability(input.orgId, input.sourceId, availability);
    return toPublicSource({ ...row, availability }, new Date().toISOString());
  }
}
