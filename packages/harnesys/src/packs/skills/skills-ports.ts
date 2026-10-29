export interface SkillsCreateSkillInput {
  orgId: string;
  actor: string;
  body: {
    name: string;
    description: string;
    whenToUse?: string;
    instructions: string;
  };
}

export interface SkillsInstallSkillInput {
  orgId: string;
  actor: string;
  source: string;
  ref?: string;
  skill?: string;
  all?: boolean;
}

export interface SkillsSearchResult {
  results: unknown[];
  degraded?: boolean;
  hint?: string;
}

export interface SkillsPackPorts {
  createSkill(input: SkillsCreateSkillInput): Promise<{ name: string }>;
  installSkill(input: SkillsInstallSkillInput): Promise<{
    installed: string[];
    candidates?: string[];
  }>;
  searchSkills(query: string): Promise<SkillsSearchResult>;
  resolveOrgId(): string | undefined;
}
