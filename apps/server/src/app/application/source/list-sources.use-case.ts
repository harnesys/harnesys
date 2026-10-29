import { Injectable } from '@harnesys/brix';
import type { SourcesListResponse } from '@harnesys/contracts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { filterSourcesByVisibility } from '../../domain/source/ui-visibility.policy.ts';
import { EnsureWorkspaceUseCase } from './ensure-workspace.use-case.ts';
import { toPublicSource } from './to-public-source.ts';

export interface ListSourcesInput {
  orgId: string;
  surfaceHostId: string | null;
}

@Injectable()
export class ListSourcesUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly ensureWorkspace: EnsureWorkspaceUseCase,
  ) {}

  execute(input: ListSourcesInput): SourcesListResponse {
    this.ensureWorkspace.execute(input.orgId);
    const all = this.sources.list(input.orgId).map((row) => toPublicSource(row));
    return {
      sources: filterSourcesByVisibility(all, input.surfaceHostId),
    };
  }
}
