import { ConflictException, ValidationException } from '@harnesys/brix';
import type { ContentMoveItem } from '@harnesys/contracts';
import {
  ContentAlreadyExistsException,
  ContentNotFoundException,
  ContentProxyException,
} from '../../domain/content/content.error.ts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface ResolvedRelMove {
  fromRel: string;
  toRel: string;
}

export function normalizeRel(path: string): string {
  return path.replace(/^\/+/, '').replaceAll('\\', '/').replace(/\/+$/, '');
}

export function isInsideRel(parent: string, child: string): boolean {
  return child.startsWith(`${parent}/`);
}

export interface PlanRelMovesInput {
  verb: 'move' | 'copy';
  port: OrgContentPort;
  orgId: string;
  sourceId: string;
  items: ContentMoveItem[];
  worktreeId?: string;
}

export async function planRelMoves(input: PlanRelMovesInput): Promise<ResolvedRelMove[]> {
  const { verb, port, orgId, sourceId, items } = input;
  const worktreeId = input.worktreeId;
  const moves: ResolvedRelMove[] = [];
  const destinations = new Set<string>();
  for (const item of items) {
    const fromRel = normalizeRel(item.from);
    const toRel = normalizeRel(item.to);
    if (!fromRel || !toRel) {
      throw new ValidationException('from and to are required');
    }
    if (fromRel === toRel) {
      throw new ValidationException(`source and destination are the same: ${fromRel}`);
    }
    if (isInsideRel(fromRel, toRel)) {
      throw new ConflictException(`cannot ${verb} ${fromRel} into itself`);
    }
    if (destinations.has(toRel)) {
      throw new ConflictException(`duplicate destination: ${toRel}`);
    }
    destinations.add(toRel);
    if (!(await hasPath(port, orgId, sourceId, fromRel, worktreeId))) {
      throw new ContentNotFoundException(fromRel);
    }
    if (await hasPath(port, orgId, sourceId, toRel, worktreeId)) {
      throw new ContentAlreadyExistsException(toRel);
    }
    moves.push({ fromRel, toRel });
  }
  rejectNestedMoves(verb, moves);
  return moves;
}

function rejectNestedMoves(verb: 'move' | 'copy', moves: ResolvedRelMove[]): void {
  for (const move of moves) {
    const nested = moves.find(
      (other) => other !== move && isInsideRel(move.fromRel, other.fromRel),
    );
    if (nested) {
      throw new ValidationException(
        `${nested.fromRel} is inside ${move.fromRel}; ${verb} the parent only`,
      );
    }
  }
}

export async function hasPath(
  port: OrgContentPort,
  orgId: string,
  sourceId: string,
  relPath: string,
  worktreeId?: string,
): Promise<boolean> {
  try {
    await port.stat(orgId, sourceId, relPath, worktreeId);
    return true;
  } catch (err) {
    if (isMissingError(err)) {
      return false;
    }
    throw err;
  }
}

function isMissingError(err: unknown): boolean {
  if (err instanceof ContentNotFoundException) {
    return true;
  }
  if (err instanceof ContentProxyException) {
    return err.status === 404 || err.errorCode === 'ENTITY_NOT_FOUND';
  }
  return false;
}
