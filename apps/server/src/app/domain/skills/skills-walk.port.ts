export interface WalkCandidate {
  name: string;
  description: string;
  whenToUse?: string;
  dir: string;
  relativePath: string;
  outsideContainer: boolean;
  invalidReason?: string;
}

export interface WalkResult {
  candidates: WalkCandidate[];
  agentMarkdownPaths: string[];
}

export abstract class SkillsWalkPort {
  abstract walkSkills(root: string): Promise<WalkResult>;
}
