import { Injectable } from '@harnesys/brix';
import {
  type ContentSearchError,
  type ContentSearchFile,
  type ContentSearchQuery,
  type ContentSearchResponse,
  MAX_SEARCH_MATCHES,
} from '@harnesys/contracts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';
import { searchOptionsFromQuery } from '../../domain/content/search-options.ts';
import { compileSearchPattern } from '../../domain/content/search-pattern.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { filterSourcesByVisibility } from '../../domain/source/ui-visibility.policy.ts';

export interface SearchContentInput {
  orgId: string;
  surfaceHostId: string | null;
  query: ContentSearchQuery;
}

@Injectable()
export class SearchContentUseCase {
  constructor(
    private readonly content: OrgContentPort,
    private readonly sources: SourceRegistryPort,
  ) {}

  async execute(input: SearchContentInput): Promise<ContentSearchResponse> {
    const limit = input.query.limit ?? MAX_SEARCH_MATCHES;
    const options = searchOptionsFromQuery(input.query, limit);
    compileSearchPattern(input.query.q, options);
    const targets = this.resolveTargets(input);
    const files: ContentSearchFile[] = [];
    const errors: ContentSearchError[] = [];
    let remaining = limit;
    let truncated = false;
    for (const source of targets) {
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      try {
        const result = await this.content.search(input.orgId, source.id, input.query.q, {
          ...options,
          limit: remaining,
        });
        files.push(...result.files);
        remaining -= result.matchCount;
        truncated = truncated || result.truncated;
      } catch (err) {
        errors.push({
          sourceId: source.id,
          sourceName: source.name,
          message: err instanceof Error ? err.message : 'search failed',
        });
      }
    }
    const matchCount = files.reduce((sum, file) => sum + file.matches.length, 0);
    return { fileCount: files.length, matchCount, files, truncated, errors };
  }

  private resolveTargets(input: SearchContentInput): SourceRecord[] {
    const visible = filterSourcesByVisibility(this.sources.list(input.orgId), input.surfaceHostId);
    const sourceId = input.query.sourceId;
    return sourceId === undefined ? visible : visible.filter((row) => row.id === sourceId);
  }
}
