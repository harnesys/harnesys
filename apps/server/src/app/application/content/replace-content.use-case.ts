import { Injectable } from '@harnesys/brix';
import type {
  ContentReplaceBody,
  ContentReplaceFile,
  ContentReplaceResponse,
  ContentReplaceTarget,
  ContentSearchError,
} from '@harnesys/contracts';
import {
  type ContentReplaceFileTarget,
  OrgContentPort,
} from '../../domain/content/org-content.port.ts';
import { replaceOptionsFromBody } from '../../domain/content/search-options.ts';
import { compileSearchPattern } from '../../domain/content/search-pattern.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { filterSourcesByVisibility } from '../../domain/source/ui-visibility.policy.ts';

export interface ReplaceContentInput {
  orgId: string;
  surfaceHostId: string | null;
  body: ContentReplaceBody;
}

@Injectable()
export class ReplaceContentUseCase {
  constructor(
    private readonly content: OrgContentPort,
    private readonly sources: SourceRegistryPort,
  ) {}

  async execute(input: ReplaceContentInput): Promise<ContentReplaceResponse> {
    const options = replaceOptionsFromBody(input.body);
    compileSearchPattern(input.body.q, options);
    const grouped = groupTargets(input.body.targets);
    const targets = this.resolveTargets(input).filter(
      (source) => grouped.size === 0 || grouped.has(source.id),
    );
    const files: ContentReplaceFile[] = [];
    const errors: ContentSearchError[] = [];
    let truncated = false;
    for (const source of targets) {
      try {
        const sourceTargets = grouped.get(source.id);
        const result = await this.content.replace(input.orgId, source.id, {
          query: input.body.q,
          replacement: input.body.replacement,
          options: sourceTargets ? { ...options, targets: sourceTargets } : options,
        });
        for (const file of result.files) {
          files.push({ sourceId: source.id, path: file.path, replaced: file.replaced });
        }
        truncated = truncated || result.truncated;
      } catch (err) {
        errors.push({
          sourceId: source.id,
          sourceName: source.name,
          message: err instanceof Error ? err.message : 'replace failed',
        });
      }
    }
    const matchCount = files.reduce((sum, file) => sum + file.replaced, 0);
    return {
      fileCount: files.length,
      matchCount,
      files,
      truncated,
      dryRun: options.dryRun,
      errors,
    };
  }

  private resolveTargets(input: ReplaceContentInput): SourceRecord[] {
    const visible = filterSourcesByVisibility(this.sources.list(input.orgId), input.surfaceHostId);
    const sourceId = input.body.sourceId;
    return sourceId === undefined ? visible : visible.filter((row) => row.id === sourceId);
  }
}

function groupTargets(
  targets: ContentReplaceTarget[] | undefined,
): Map<string, ContentReplaceFileTarget[]> {
  const grouped = new Map<string, ContentReplaceFileTarget[]>();
  for (const target of targets ?? []) {
    const list = grouped.get(target.sourceId) ?? [];
    list.push({
      path: target.path,
      ...(target.line ? { line: target.line } : {}),
      ...(target.column ? { column: target.column } : {}),
      ...(target.matchText === undefined ? {} : { matchText: target.matchText }),
    });
    grouped.set(target.sourceId, list);
  }
  return grouped;
}
