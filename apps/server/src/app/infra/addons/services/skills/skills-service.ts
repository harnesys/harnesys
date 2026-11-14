import { Injectable } from '@harnesys/brix';
import type { EffectiveSkill, ListEffectiveSkillsResponse, OrgSkill } from '@harnesys/contracts';
import { AddonError } from '@harnesys/sdk';
import { GetEffectiveSkillsUseCase } from '../../../../application/skills/get-effective-skills.use-case.ts';
import { ListOrgSkillsUseCase } from '../../../../application/skills/list-org-skills.use-case.ts';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { AgentNotFoundException } from '../../../../domain/agent/agent.error.ts';
import { ThreadAgentRepositoryPort } from '../../../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../../../domain/thread/thread-repository.port.ts';
import { serviceMethod } from '../method.ts';

const SKILLS_LIMITS = { timeoutMs: 10000 };

interface ProtocolSkill {
  id: string;
  name: string;
  description: string | null;
  source: string;
}

@Injectable()
export class SkillsHostService implements HostServiceModule {
  readonly namespace = 'skills';
  readonly methods: readonly HostMethodSpec[];

  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly effectiveSkills: GetEffectiveSkillsUseCase,
    private readonly orgSkills: ListOrgSkillsUseCase,
  ) {
    this.methods = [
      serviceMethod('skills.list', SKILLS_LIMITS, (ctx, params) => this.list(ctx, params)),
    ];
  }

  private async list(
    ctx: HostCallContext,
    params: { threadId?: string },
  ): Promise<{ skills: ProtocolSkill[] }> {
    if (params.threadId === undefined) {
      const org = await this.orgSkills.execute({ orgId: ctx.orgId });
      return { skills: org.skills.map(skillOf) };
    }
    const thread = this.threads.findById(ctx.orgId, params.threadId);
    if (!thread) {
      throw new AddonError('not_found', { detail: `thread ${params.threadId} not found` });
    }
    const agentId = this.threadAgents.listByThread(ctx.orgId, params.threadId)[0]?.agentId;
    if (!agentId) {
      return { skills: [] };
    }
    let effective: ListEffectiveSkillsResponse;
    try {
      effective = await this.effectiveSkills.execute({ orgId: ctx.orgId, agentId });
    } catch (error) {
      if (error instanceof AgentNotFoundException) {
        throw new AddonError('not_found', { detail: error.message });
      }
      throw error;
    }
    return { skills: effective.skills.map(skillOf) };
  }
}

function skillOf(skill: OrgSkill | EffectiveSkill): ProtocolSkill {
  return {
    id: skill.name,
    name: skill.name,
    description: skill.description,
    source: skill.origin.kind,
  };
}
