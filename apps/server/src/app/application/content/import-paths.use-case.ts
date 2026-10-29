import { ConflictException, Injectable, ValidationException } from '@harnesys/brix';
import type { ContentImportItem, ContentImportResponse } from '@harnesys/contracts';
import { ContentAlreadyExistsException } from '../../domain/content/content.error.ts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';
import { hasPath, normalizeRel, type ResolvedRelMove } from './path-plan.ts';

export interface ImportPathsInput {
  orgId: string;
  sourceId: string;
  items: ContentImportItem[];
  worktreeId?: string;
}

@Injectable()
export class ImportPathsUseCase {
  constructor(private readonly content: OrgContentPort) {}

  async execute(input: ImportPathsInput): Promise<ContentImportResponse> {
    const moves = await this.plan(input.orgId, input.sourceId, input.items, input.worktreeId);
    await this.apply(input.orgId, input.sourceId, moves, input.worktreeId);
    return {
      imported: moves.map(({ fromRel, toRel }) => ({ fromAbs: fromRel, toRel })),
    };
  }

  private async plan(
    orgId: string,
    sourceId: string,
    items: ContentImportItem[],
    worktreeId?: string,
  ): Promise<ResolvedRelMove[]> {
    const moves: ResolvedRelMove[] = [];
    const destinations = new Set<string>();
    for (const item of items) {
      const toRel = normalizeRel(item.toRel);
      if (!item.fromAbs.startsWith('/') || !toRel) {
        throw new ValidationException('fromAbs and toRel are required');
      }
      if (destinations.has(toRel)) {
        throw new ConflictException(`duplicate destination: ${toRel}`);
      }
      destinations.add(toRel);
      if (await hasPath(this.content, orgId, sourceId, toRel, worktreeId)) {
        throw new ContentAlreadyExistsException(toRel);
      }
      moves.push({ fromRel: item.fromAbs, toRel });
    }
    return moves;
  }

  private async apply(
    orgId: string,
    sourceId: string,
    moves: ResolvedRelMove[],
    worktreeId?: string,
  ): Promise<void> {
    const done: ResolvedRelMove[] = [];
    for (const move of moves) {
      try {
        await this.content.importPaths(orgId, sourceId, move.fromRel, move.toRel, worktreeId);
        done.push(move);
      } catch (err) {
        await this.rollback(orgId, sourceId, done, worktreeId);
        throw new ConflictException(
          `Failed to import ${move.toRel}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async rollback(
    orgId: string,
    sourceId: string,
    done: ResolvedRelMove[],
    worktreeId?: string,
  ): Promise<void> {
    for (const move of [...done].reverse()) {
      try {
        await this.content.remove(orgId, sourceId, move.toRel, worktreeId);
      } catch {}
    }
  }
}
