import type { CreateOrgSkillBody, OrgSkill, SkillSidecar } from '@harnesys/contracts';

export abstract class OrgSkillsPort {
  abstract list(orgId: string): OrgSkill[];
  abstract create(orgId: string, body: CreateOrgSkillBody): OrgSkill;
  abstract remove(orgId: string, name: string): void;
  abstract readSidecar(orgId: string, name: string): SkillSidecar | undefined;
  abstract writeSkillDirAtomic(
    orgId: string,
    name: string,
    sourceDir: string,
    sidecar: SkillSidecar,
  ): void;
}
