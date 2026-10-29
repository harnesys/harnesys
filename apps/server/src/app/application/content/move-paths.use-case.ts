import { ConflictException, Injectable } from '@harnesys/brix';
import type { ContentMoveItem, ContentMoveResponse } from '@harnesys/contracts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';
import { planRelMoves, type ResolvedRelMove } from './path-plan.ts';

export interface MovePathsInput {
  orgId: string;
  sourceId: string;
  items: ContentMoveItem[];
  worktreeId?: string;
}

@Injectable()
export class MovePathsUseCase {
  constructor(private readonly content: OrgContentPort) {}

  async execute(input: MovePathsInput): Promise<ContentMoveResponse> {
    const moves = await planRelMoves({
      verb: 'move',
      port: this.content,
      orgId: input.orgId,
      sourceId: input.sourceId,
      items: input.items,
      worktreeId: input.worktreeId,
    });
    await this.apply(input.orgId, input.sourceId, moves, input.worktreeId);
    return { moved: moves.map(({ fromRel, toRel }) => ({ from: fromRel, to: toRel })) };
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
        await this.content.move(orgId, sourceId, move.fromRel, move.toRel, worktreeId);
        done.push(move);
      } catch (err) {
        await this.rollback(orgId, sourceId, done, worktreeId);
        throw new ConflictException(
          `Failed to move ${move.fromRel}: ${err instanceof Error ? err.message : String(err)}`,
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
        await this.content.move(orgId, sourceId, move.toRel, move.fromRel, worktreeId);
      } catch {}
    }
  }
}
