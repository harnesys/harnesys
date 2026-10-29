import { ConflictException, Injectable } from '@harnesys/brix';
import type { ContentCopyResponse, ContentMoveItem } from '@harnesys/contracts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';
import { planRelMoves, type ResolvedRelMove } from './path-plan.ts';

export interface CopyPathsInput {
  orgId: string;
  sourceId: string;
  items: ContentMoveItem[];
  worktreeId?: string;
}

@Injectable()
export class CopyPathsUseCase {
  constructor(private readonly content: OrgContentPort) {}

  async execute(input: CopyPathsInput): Promise<ContentCopyResponse> {
    const moves = await planRelMoves({
      verb: 'copy',
      port: this.content,
      orgId: input.orgId,
      sourceId: input.sourceId,
      items: input.items,
      worktreeId: input.worktreeId,
    });
    await this.apply(input.orgId, input.sourceId, moves, input.worktreeId);
    return { copied: moves.map(({ fromRel, toRel }) => ({ from: fromRel, to: toRel })) };
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
        await this.content.copy(orgId, sourceId, move.fromRel, move.toRel, worktreeId);
        done.push(move);
      } catch (err) {
        await this.rollback(orgId, sourceId, done, worktreeId);
        throw new ConflictException(
          `Failed to copy ${move.fromRel}: ${err instanceof Error ? err.message : String(err)}`,
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
