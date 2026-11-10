import { SkillsWalkPort } from '../../domain/skills/skills-walk.port.ts';
import type { WalkResult } from '../../domain/skills/skills-walk.port.ts';
import { walkSkills } from './skills-walk.ts';
import { Injectable } from '@harnesys/brix';

@Injectable()
export class SkillsWalkAdapter extends SkillsWalkPort {
  override walkSkills(root: string): Promise<WalkResult> {
    return walkSkills(root);
  }
}
