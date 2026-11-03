import type { Thread } from '@/entities/thread';

export type MentionKind = 'agent' | 'user';

export interface MentionOption {
  id: string;
  label: string;
  kind: MentionKind;
  handle: string;
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

export function threadMentionOptions(thread: Thread | undefined): MentionOption[] {
  if (thread?.kind !== 'group') {
    return [];
  }
  const agents = (thread.members ?? []).map((member) => ({
    id: member.id,
    label: member.name,
    kind: 'agent' as const,
    handle: mentionHandle(member.name),
  }));
  const users = (thread.participants ?? []).map((participant) => ({
    id: participant.id,
    label: participant.displayName,
    kind: 'user' as const,
    handle: mentionHandle(participant.username ?? participant.displayName),
  }));
  return [...agents, ...users];
}
