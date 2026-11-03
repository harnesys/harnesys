import type { Agent } from '@/entities/agent';
import type { Thread } from '@/entities/thread';

export type MentionKind = 'agent' | 'user';

export interface MentionOption {
  id: string;
  label: string;
  kind: MentionKind;
  handle: string;
  initials: string;
  color: string | null;
}

const MAX_MENTIONS = 8;

export function mentionHandle(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '');
  return slug || 'member';
}

export function filterMentions(
  query: string,
  options: MentionOption[] | undefined,
): MentionOption[] {
  const list = options ?? [];
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return list.slice(0, MAX_MENTIONS);
  }
  return list
    .filter(
      (option) => option.handle.includes(needle) || option.label.toLowerCase().includes(needle),
    )
    .slice(0, MAX_MENTIONS);
}

function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AG';
  }
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? 'AG';
  }
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

export function threadMentionOptions(
  thread: Thread | undefined,
  agents: Agent[] = [],
): MentionOption[] {
  if (thread?.kind !== 'group') {
    return [];
  }
  const agentOptions = (thread.members ?? []).map((member) => {
    const agent = agents.find((item) => item.id === member.id);
    return {
      id: member.id,
      label: member.name,
      kind: 'agent' as const,
      handle: mentionHandle(member.name),
      initials: agent?.initials ?? agentInitials(member.name),
      color: agent?.color ?? null,
    };
  });
  const users = (thread.participants ?? []).map((participant) => ({
    id: participant.id,
    label: participant.displayName,
    kind: 'user' as const,
    handle: mentionHandle(participant.username ?? participant.displayName),
    initials: agentInitials(participant.displayName),
    color: null,
  }));
  return [...agentOptions, ...users];
}
