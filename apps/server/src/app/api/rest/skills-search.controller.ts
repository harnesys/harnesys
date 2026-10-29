import { Controller, Get, Query } from '@harnesys/brix';
import type { SkillSearchResponse } from '@harnesys/contracts';
import { z } from 'zod';
import { SearchSkillsUseCase } from '../../application/skills/search-skills.use-case.ts';

export const SkillSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export type SkillSearchQuery = z.infer<typeof SkillSearchQuerySchema>;

@Controller('skills/search')
export class SkillsSearchController {
  constructor(private readonly searchSkills: SearchSkillsUseCase) {}

  @Get()
  search(@Query(SkillSearchQuerySchema) query: SkillSearchQuery): Promise<SkillSearchResponse> {
    return this.searchSkills.execute({ query: query.q });
  }
}
