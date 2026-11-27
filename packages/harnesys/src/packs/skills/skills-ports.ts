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
  more?: number;
  degraded?: boolean;
  hint?: string;
}

export interface SkillsListEntry {
  name: string;
  origin: string;
  installedFrom?: string;
  updateAvailable?: boolean;
}

export interface SkillsDeleteSkillInput {
  orgId: string;
  name: string;
}

export interface SkillsPackPorts {
  createSkill(input: SkillsCreateSkillInput): Promise<{ name: string }>;
  listSkills(orgId: string): Promise<{ skills: SkillsListEntry[] }>;
  deleteSkill(input: SkillsDeleteSkillInput): Promise<void>;
  installSkill(input: SkillsInstallSkillInput): Promise<{
    installed: string[];
    candidates?: string[];
  }>;
  searchSkills(query: string): Promise<SkillsSearchResult>;
  resolveOrgId(): string | undefined;
}
