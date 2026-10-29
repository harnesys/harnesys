export interface PlacementVisibilityInput {
  selectedNodeId: string | null | undefined;
  localHostId: string | null | undefined;
  lastSelectedNodeId: string | null | undefined;
}

export function shouldShowPlacementInFeed(input: PlacementVisibilityInput): boolean {
  const selected = input.selectedNodeId?.trim() || null;
  if (!selected) {
    return true;
  }
  const local = input.localHostId?.trim() || null;
  if (local && selected !== local) {
    return true;
  }
  const previous = input.lastSelectedNodeId?.trim() || null;
  if (previous && selected !== previous) {
    return true;
  }
  return false;
}
