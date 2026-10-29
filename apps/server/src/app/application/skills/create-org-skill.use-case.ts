import { Injectable } from '@harnesys/brix';
import type { CreateOrgSkillBody, CreateOrgSkillResponse } from '@harnesys/contracts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';

export interface CreateOrgSkillRequest {
  orgId: string;
  body: CreateOrgSkillBody;
}

@Injectable()
export class CreateOrgSkillUseCase {
  constructor(private readonly skills: OrgSkillsPort) {}

  execute(request: CreateOrgSkillRequest): CreateOrgSkillResponse {
    return { skill: this.skills.create(request.orgId, request.body) };
  }
}
