export type SourceIndexState = 'not-indexed' | 'selected-paths' | 'entire-source';

export interface SourceIndexStateInput {
  entireSource: boolean;
  indexed: number;
  pending: number;
  total: number;
  running: boolean;
}

export function sourceIndexStateOf(input: SourceIndexStateInput): SourceIndexState {
  if (input.entireSource && input.pending === 0 && input.total > 0) {
    return 'entire-source';
  }
  if (input.indexed > 0) {
    return 'selected-paths';
  }
  return 'not-indexed';
}
