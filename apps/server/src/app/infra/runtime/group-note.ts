export interface GroupNoteInput {
  window: number;
  total: number;
}

export function groupChannelNote(input: GroupNoteInput): string {
  return [
    `You are one of several agents in a group conversation (${input.total} messages so far).`,
    `This run starts from a clean window of the last ${input.window} messages; messages written before it, and other agents' tool steps, are not in view.`,
    'When the window is not enough, thread_history with beforeSeq and limit returns older messages; use it only in that case.',
  ].join(' ');
}
