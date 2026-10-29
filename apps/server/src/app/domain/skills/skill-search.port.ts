import type { SkillSearchResponse } from '@harnesys/contracts';

export abstract class SkillSearchPort {
  abstract search(query: string): Promise<SkillSearchResponse>;
}
