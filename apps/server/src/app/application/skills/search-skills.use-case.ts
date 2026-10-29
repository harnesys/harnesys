import { Injectable } from '@harnesys/brix';
import type { SkillSearchResponse } from '@harnesys/contracts';
import { SkillSearchPort } from '../../domain/skills/skill-search.port.ts';

export interface SearchSkillsRequest {
  query: string;
}

@Injectable()
export class SearchSkillsUseCase {
  constructor(private readonly search: SkillSearchPort) {}

  execute(request: SearchSkillsRequest): Promise<SkillSearchResponse> {
    return this.search.search(request.query);
  }
}
