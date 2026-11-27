import type { PermissionMap } from '../ports/permissions.ts';
import type { BudgetLeft } from './budget.ts';
import { STOP_AFTER_IDENTICAL_CALLS } from './loop-guard.ts';
export interface LlmNote {
  tag: string;
  text: string;
}
export interface LlmNoteContext {
  agentId: string;
  runId: string;
  sessionId: string;
  nodeId: string;
  steps: number;
  state: Readonly<Record<string, unknown>>;
  permissions?: PermissionMap;
  userText?: string;
}
export type LlmNoteProvider = (ctx: LlmNoteContext) => LlmNote[] | Promise<LlmNote[]>;
export function assembleNotes(notes: LlmNote[]): string {
  if (notes.length === 0) {
    return '';
  }
  const blocks = notes.map((n) => `<${n.tag}>\n${n.text}\n</${n.tag}>`).join('\n');
  return `Runtime notes (refreshed before this step):\n${blocks}`;
}
export function loopNote(tool: string, repeats: number): LlmNote {
  const blocking = repeats >= STOP_AFTER_IDENTICAL_CALLS - 1;
  return {
    tag: 'loop',
    text:
      `You have made ${repeats} identical calls to "${tool}" in a row with the same arguments; ` +
      'calling it again cannot change the result. ' +
      (blocking ? 'One more identical call stops the whole run. ' : '') +
      'Switch to a different tool, change the arguments meaningfully, or finish with the data you already have.',
  };
}
export type BudgetSource = 'own' | 'parent';

export function budgetNote(
  left: BudgetLeft,
  closing = false,
  source: BudgetSource = 'own',
): LlmNote {
  const parts: string[] = [];
  if (left.stepsLeft !== undefined) {
    parts.push(
      `steps remaining: ${left.stepsLeft}${left.stepsTotal !== undefined ? `/${left.stepsTotal}` : ''}`,
    );
  }
  if (left.tokensLeft !== undefined) {
    parts.push(
      `tokens remaining: ~${left.tokensLeft}${left.tokensTotal !== undefined ? `/${left.tokensTotal}` : ''}`,
    );
  }
  if (left.msLeft !== undefined) {
    parts.push(`time remaining: ~${Math.max(1, Math.ceil(left.msLeft / 60000))} min`);
  }
  const origin =
    source === 'parent'
      ? 'Budget was set by your parent agent for this run; it is independent of the parent budget and cannot be extended. '
      : '';
  if (closing) {
    const counter = parts.length > 0 ? `${parts.join(' · ')}. ` : '';
    return {
      tag: 'budget',
      text:
        `${origin}${counter}This is your last step and no tools are available. ` +
        'Do not attempt tool calls. Write your final report now: what you did, ' +
        'what you found, and what is left unfinished.',
    };
  }
  const counter = parts.join(' · ');
  if (left.warn === 'last') {
    return {
      tag: 'budget',
      text: `${origin}${counter} — this is your last step: write your final report now.`,
    };
  }
  if (left.warn === 'soon') {
    return {
      tag: 'budget',
      text: `${origin}${counter} — finish the current work, update the plan, summarize what remains.`,
    };
  }
  return {
    tag: 'budget',
    text: `${origin}${counter}. This budget is fixed for the whole run — no more steps are granted after it. Plan the work to fit and wrap up before the last step.`,
  };
}
