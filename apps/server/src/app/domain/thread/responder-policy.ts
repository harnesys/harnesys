export interface ResponderMember {
  id: string;
  name: string;
}

export interface ResponderInput {
  text: string;
  explicitAgentId?: string | null;
  repliedToAgentId?: string | null;
  members: ResponderMember[];
  autoReplyAgentId?: string | null;
  allowMentions?: boolean;
}

const MENTION_PATTERN = /@([\p{L}\p{N}._-]{1,64})/gu;

export function mentionSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '');
}

function memberAliases(members: ResponderMember[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const member of members) {
    aliases.set(member.name.toLowerCase(), member.id);
    const slug = mentionSlug(member.name);
    if (slug) {
      aliases.set(slug, member.id);
    }
  }
  return aliases;
}

export function mentionedNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const name = match[1]?.toLowerCase();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function resolveResponders(input: ResponderInput): string[] {
  const members = new Set(input.members.map((member) => member.id));
  const addressed: string[] = [];
  const push = (agentId: string | null | undefined): void => {
    if (!agentId || !members.has(agentId) || addressed.includes(agentId)) {
      return;
    }
    addressed.push(agentId);
  };
  push(input.explicitAgentId ?? null);
  if (input.allowMentions !== false) {
    const aliases = memberAliases(input.members);
    for (const name of mentionedNames(input.text)) {
      push(aliases.get(name) ?? null);
    }
  }
  push(input.repliedToAgentId ?? null);
  if (addressed.length > 0) {
    return addressed;
  }
  const autoReply = input.autoReplyAgentId ?? null;
  return autoReply && members.has(autoReply) ? [autoReply] : [];
}
