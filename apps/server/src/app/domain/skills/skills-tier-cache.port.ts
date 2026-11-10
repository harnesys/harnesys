import type { SkillOrigin } from '@harnesys/contracts';
import type { SkillRegistry, SkillSummary } from 'harnesys';

export interface TierEntry {
  summary: SkillSummary;
  origin: SkillOrigin;
  path?: string;
}

export abstract class SkillsTierCachePort {
  abstract entries(): Promise<TierEntry[]>;
  abstract registries(): SkillRegistry[];
  abstract invalidate(): void;
}
