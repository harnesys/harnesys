export interface SkillSummary {
  name: string;
  description: string;
  whenToUse?: string;
}
export type SkillDocument = SkillSummary & {
  instructions: string;
  files?: string[];
};
export interface SkillFile {
  path: string;
  content: string;
}
