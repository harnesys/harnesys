import type { GroupChannelMember } from '../../domain/thread/prepare-runtime-input.ts';
import type { GroupHistoryCoverage, ThreadHistoryMode } from '../../domain/thread/thread-policy.ts';

export interface GroupPromptInput {
  members: readonly GroupChannelMember[];
  allowMentions: boolean;
}

export interface GroupFactsInput {
  mode: ThreadHistoryMode;
  historyLast: number;
  total: number;
  coverage?: GroupHistoryCoverage;
}

export function groupChannelPrompt(input: GroupPromptInput): string {
  const lines = [
    'You are one of several agents in a group conversation; every message is visible to all participants.',
  ];
  const listed = memberList(input.members);
  if (listed.length > 0) {
    lines.push(`Participants: ${listed}.`);
    lines.push(...mentionRules(input.allowMentions));
  }
  return lines.join(' ');
}

export function groupChannelFacts(input: GroupFactsInput): string {
  return [`${input.total} messages in this conversation so far.`, noteHistory(input)].join(' ');
}

function mentionRules(allowMentions: boolean): string[] {
  if (!allowMentions) {
    return [
      'Every message is read by everyone; addressing a participant by name is only informational.',
    ];
  }
  return [
    'Write @handle to address a participant directly; a message without a mention is read by everyone.',
    'Mentioning another agent hands it the next turn and wakes it with your message; mention one agent at a time, only when you need it to act. Mentioning a human does not start a run.',
    'A mention wakes an agent only if it has not taken a turn since the last human message, so do not mention yourself or use mentions to loop or to thank someone. When quoting a handle, wrap it in backticks so it stays plain text.',
    'When a message mentions you, answer it; otherwise continue with your own task.',
  ];
}

function memberList(members: readonly GroupChannelMember[]): string {
  return members
    .map((member) => `${member.name} (@${member.handle}${member.isSelf ? ', you' : ''})`)
    .join(', ');
}

function noteHistory(input: GroupFactsInput): string {
  if (input.mode === 'full') {
    return 'The full conversation is replayed, minus other agents tool steps; nothing older exists, so do not call threads_history.';
  }
  if (input.mode === 'none') {
    return noteWithoutHistory(input);
  }
  if (input.coverage?.complete === true) {
    return `All ${input.total} messages, including this turn, are in your context; nothing older exists, so do not call threads_history.`;
  }
  if (input.coverage) {
    return `${input.coverage.visible} of ${input.total} messages are in your context (last ${input.historyLast} runs); call threads_history with beforeSeq and limit only if you need the older ones.`;
  }
  return `The last ${input.historyLast} runs are replayed; older turns and other agents tool steps are not in view — call threads_history only if you need them.`;
}

function noteWithoutHistory(input: GroupFactsInput): string {
  if (input.coverage?.complete === true) {
    return 'Only the current turn is in view; nothing older exists, so do not call threads_history.';
  }
  return 'Only the current turn is in view; threads_history with beforeSeq and limit returns the older messages if you need them.';
}
