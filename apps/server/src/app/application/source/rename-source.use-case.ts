import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import {
  SourceNotFoundException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { toPublicSource } from './to-public-source.ts';

export interface RenameSourceInput {
  orgId: string;
  sourceId: string;
  name: string;
}

@Injectable()
export class RenameSourceUseCase {
  constructor(private readonly sources: SourceRegistryPort) {}

  execute(input: RenameSourceInput): Source {
    const name = input.name.trim();
    if (!name) {
      throw new SourcePathInvalidException('name is required');
    }
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    this.sources.updateName(input.orgId, input.sourceId, name);
    return toPublicSource({ ...row, name }, new Date().toISOString());
  }
}
