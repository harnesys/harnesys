export interface ResolveSourceLocationInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId?: string;
}

export interface ResolvedSourceLocation {
  sourceId: string;
  hostId: string;
  absoluteRoot: string;
}

export abstract class SourceLocationPort {
  abstract resolve(input: ResolveSourceLocationInput): ResolvedSourceLocation;
}
