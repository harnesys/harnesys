export interface SourceSkillDir {
  dir: string;
  relativePath: string;
  outsideContainer: boolean;
}

export interface SourceSkillsScan {
  skillDirs: SourceSkillDir[];
  agentMarkdownPaths: string[];
}

export abstract class SourceSkillsPort {
  abstract scan(root: string): Promise<SourceSkillsScan>;
  abstract invalidate(sourceRoot: string): void;
}
