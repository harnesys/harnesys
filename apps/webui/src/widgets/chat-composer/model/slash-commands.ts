import { compactThread } from '@/features/compact-thread';
import type { EntityKind } from './entity-kinds';
export interface SlashCommandContext {
  threadId: string;
}
export type SlashCommandOutcome =
  | {
      type: 'execute';
      run(ctx: SlashCommandContext): Promise<string | undefined>;
    }
  | {
      type: 'picker';
      kind: EntityKind;
    };
export interface SlashCommand {
  name: string;
  description: string;
  outcome: SlashCommandOutcome;
}
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'compact',
    description: 'Compact this thread window now',
    outcome: {
      type: 'execute',
      async run(ctx) {
        const result = await compactThread({ threadId: ctx.threadId });
        if (result.compacted) {
          return undefined;
        }
        if (result.reason === 'no-context-window') {
          return 'Compaction unavailable: model context window is unknown';
        }
        if (result.reason === 'invalid-output-reserve') {
          return 'Compaction unavailable: output reserve exceeds the context window';
        }
        if (result.reason === 'resume-pending') {
          return 'Compaction unavailable: a run is still in progress';
        }
        if (result.reason === 'already-covered') {
          return 'History is already fully compacted';
        }
        if (result.reason === 'hook-blocked') {
          return 'Compaction blocked by a PreCompact hook';
        }
        if (result.reason === 'empty-history') {
          return 'Nothing to compact: the thread has no messages';
        }
        return 'Nothing to compact';
      },
    },
  },
  {
    name: 'skills',
    description: 'Attach a skill to this message',
    outcome: { type: 'picker', kind: 'skill' },
  },
];
