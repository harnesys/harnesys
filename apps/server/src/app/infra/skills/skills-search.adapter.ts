import { Injectable } from '@harnesys/brix';
import type { SkillSearchHit, SkillSearchResponse } from '@harnesys/contracts';
import { APP_VERSION } from '../../../const.ts';
import { SkillSearchPort } from '../../domain/skills/skill-search.port.ts';
import { SkillValidationException } from '../../domain/skills/skills.error.ts';

const SEARCH_URL = 'https://skills.sh/api/search';
const TIMEOUT_MS = 8_000;
const MAX_RESULTS = 50;
const DEGRADED: SkillSearchResponse = {
  results: [],
  degraded: true,
  hint: 'registry unavailable — install by repository URL instead',
};

interface RegistryEntry {
  id?: unknown;
  source?: unknown;
  skillId?: unknown;
  name?: unknown;
  installs?: unknown;
  isDuplicate?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

@Injectable()
export class SkillsSearchAdapter extends SkillSearchPort {
  async search(query: string): Promise<SkillSearchResponse> {
    const q = query.trim();
    if (q.length < 2) {
      throw new SkillValidationException('search query must be at least 2 characters');
    }
    let payload: unknown;
    try {
      const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': `harnesys/${APP_VERSION}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return DEGRADED;
      }
      payload = await res.json();
    } catch {
      return DEGRADED;
    }
    return { results: toHits(payload) };
  }
}

function toHits(payload: unknown): SkillSearchHit[] {
  if (typeof payload !== 'object' || payload === null || !('skills' in payload)) {
    return [];
  }
  const skills = payload.skills;
  if (!Array.isArray(skills)) {
    return [];
  }
  const hits: SkillSearchHit[] = [];
  for (const raw of skills.slice(0, MAX_RESULTS)) {
    const hit = toHit(raw as RegistryEntry);
    if (hit !== undefined) {
      hits.push(hit);
    }
  }
  return hits;
}

function toHit(raw: RegistryEntry): SkillSearchHit | undefined {
  const source = asString(raw.source);
  const name = asString(raw.name);
  if (source === undefined || name === undefined) {
    return undefined;
  }
  const isDuplicate = raw.isDuplicate === true;
  return {
    id: asString(raw.id) ?? `${source}/${name}`,
    source,
    skillId: asString(raw.skillId) ?? name,
    name,
    installs: typeof raw.installs === 'number' ? raw.installs : 0,
    installUrl: `https://github.com/${source}`,
    ...(isDuplicate ? { isDuplicate } : {}),
  };
}
