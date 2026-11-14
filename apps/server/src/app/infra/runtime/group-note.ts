import type { ThreadHistoryMode } from '../../domain/thread/thread-policy.ts';

export interface GroupNoteInput {
  mode: ThreadHistoryMode;
  historyLast: number;
  total: number;
}

export function groupChannelNote(input: GroupNoteInput): string {
  const window = noteWindow(input.mode, input.historyLast);
  return [
    `You are one of several agents in a group conversation (${input.total} messages so far).`,
    window,
    'When the context is missing something, threads_history with beforeSeq and limit returns older messages; use it only in that case.',
  ].join(' ');
}

function noteWindow(mode: ThreadHistoryMode, historyLast: number): string {
  if (mode === 'full') {
    return 'This run replays the full conversation history, minus other agents tool steps.';
  }
  if (mode === 'last') {
    return `This run starts from the last ${historyLast} turns; older turns and other agents tool steps are not in view.`;
  }
  return 'This run starts without prior history; only the current turn is in view, except the newest compaction anchor.';
}
