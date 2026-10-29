export interface WorktreeFieldBody {
  sourceId?: string | null;
  branch?: string | null;
}

export interface WorktreeFieldPatch {
  sourceId?: string | null;
  branch?: string | null;
}

export interface DecideWorktreeFieldPatchInput {
  current: { sourceId: string | null; branch: string | null };
  body: WorktreeFieldBody;
  activeWorktreeState: 'ready' | 'creating' | null;
  sourceExists: (sourceId: string) => boolean;
}

export type DecideWorktreeFieldPatchResult =
  | { kind: 'ok'; patch: WorktreeFieldPatch }
  | { kind: 'bound' }
  | { kind: 'unknown-source'; sourceId: string };

export function decideWorktreeFieldPatch(
  input: DecideWorktreeFieldPatchInput,
): DecideWorktreeFieldPatchResult {
  const touchesWorktreeFields =
    input.body.sourceId !== undefined || input.body.branch !== undefined;
  if (input.activeWorktreeState !== null && touchesWorktreeFields) {
    return { kind: 'bound' };
  }
  if (input.body.sourceId !== undefined && input.body.sourceId !== null) {
    if (!input.sourceExists(input.body.sourceId)) {
      return { kind: 'unknown-source', sourceId: input.body.sourceId };
    }
  }
  const patch: WorktreeFieldPatch = {};
  if (input.body.sourceId !== undefined) {
    patch.sourceId = input.body.sourceId;
  }
  if (input.body.branch !== undefined) {
    patch.branch = input.body.branch;
  } else if (input.body.sourceId !== undefined && input.body.sourceId !== input.current.sourceId) {
    patch.branch = null;
  }
  return { kind: 'ok', patch };
}
