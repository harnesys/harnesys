import type { AgentPacks } from '../../domain/pack.ts';

export const LEGACY_WEB_PACK_ALIASES: readonly string[] = ['fetch', 'web_search'];
export const WEB_PACK_NAME = 'web';

function specOf(value: AgentPacks[string] | undefined): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    const spec = (value as { spec?: Record<string, unknown> }).spec;
    if (typeof spec === 'object' && spec !== null) {
      return spec;
    }
  }
  return {};
}

export function normalizeLegacyWebPack(packs: AgentPacks): AgentPacks {
  const hasWeb = WEB_PACK_NAME in packs;
  const hasLegacy = LEGACY_WEB_PACK_ALIASES.some((name) => name in packs);
  if (!hasWeb && !hasLegacy) {
    return packs;
  }
  const merged: Record<string, unknown> = {};
  for (const name of [...LEGACY_WEB_PACK_ALIASES, WEB_PACK_NAME]) {
    if (name in packs) {
      Object.assign(merged, specOf(packs[name]));
    }
  }
  const next: AgentPacks = {};
  for (const [name, value] of Object.entries(packs)) {
    if ((LEGACY_WEB_PACK_ALIASES as readonly string[]).includes(name)) {
      continue;
    }
    next[name] = value;
  }
  const existing = next[WEB_PACK_NAME];
  if (typeof existing === 'object' && existing !== null) {
    next[WEB_PACK_NAME] = { ...existing, spec: merged };
  } else if (existing === undefined) {
    next[WEB_PACK_NAME] = Object.keys(merged).length > 0 ? { spec: merged } : true;
  }
  return next;
}
