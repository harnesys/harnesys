import type { SessionEvent } from 'harnesys';

const SKILL_LIST_LIMIT = 3500;

export function formatThreadStats(
  events: SessionEvent[],
  status: string | null,
  costUsd: number,
): string {
  const usages = events.filter(
    (event): event is Extract<SessionEvent, { type: 'model.usage' }> =>
      event.type === 'model.usage',
  );
  if (usages.length === 0) {
    return 'No usage recorded for this thread.';
  }
  let promptTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  for (const event of usages) {
    promptTokens += event.usage.promptTokens;
    outputTokens += event.usage.generatedTokens;
    reasoningTokens += event.usage.reasoningTokens ?? 0;
  }
  const last = usages[usages.length - 1];
  return [
    `Status: ${statusLabelOf(status)}`,
    `Calls: ${usages.length}`,
    `Prompt tokens: ${promptTokens}`,
    `Output tokens: ${outputTokens}`,
    `Reasoning tokens: ${reasoningTokens}`,
    `Cost: $${costUsd.toFixed(4)}`,
    `Last model: ${last?.usage.model ?? ''}`,
  ].join('\n');
}

function statusLabelOf(status: string | null): string {
  if (status === 'running') {
    return 'running';
  }
  if (status === 'needs_input') {
    return 'needs input';
  }
  return 'idle';
}

export function formatSkillList(names: string[]): string {
  if (names.length === 0) {
    return 'This agent has no granted skills.';
  }
  const parts = ['Skills'];
  let length = 'Skills'.length;
  for (let index = 0; index < names.length; index += 1) {
    const line = `- ${names[index]}`;
    const next = length + 1 + line.length;
    if (next > SKILL_LIST_LIMIT) {
      parts.push(`… and ${names.length - index} more`);
      break;
    }
    parts.push(line);
    length = next;
  }
  return parts.join('\n');
}
