import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from 'harnesys';
import { helpText } from './bot-commands.ts';
import { formatSkillList, formatThreadStats } from './thread-stats.ts';

describe('thread stats and skill list', () => {
  test('formats empty and summed stats, skill truncation, and help text', () => {
    expect(formatThreadStats([], null, 0)).toBe('No usage recorded for this thread.');
    const events: SessionEvent[] = [
      {
        type: 'model.usage',
        usage: { model: 'a', promptTokens: 1000, generatedTokens: 300, reasoningTokens: 10 },
        runId: 'r1',
      },
      {
        type: 'model.usage',
        usage: { model: 'b', promptTokens: 200, generatedTokens: 40, reasoningTokens: 10 },
        runId: 'r2',
      },
      { type: 'user', text: 'hi', runId: 'r2' },
    ];
    expect(formatThreadStats(events, 'needs_input', 0.004)).toBe(
      [
        'Status: needs input',
        'Calls: 2',
        'Prompt tokens: 1200',
        'Output tokens: 340',
        'Reasoning tokens: 20',
        'Cost: $0.0040',
        'Last model: b',
      ].join('\n'),
    );
    expect(formatSkillList([])).toBe('This agent has no granted skills.');
    expect(formatSkillList(['alpha', 'beta'])).toBe('Skills\n- alpha\n- beta');
    const longName = 'x'.repeat(2000);
    const truncated = formatSkillList([longName, longName, 'tail']);
    expect(truncated.startsWith('Skills\n- ')).toBe(true);
    expect(truncated.includes('\n… and 2 more')).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(3516);
    expect(helpText()).toContain('/stop - Stop the current run');
    expect(helpText()).toContain('/help - List commands');
  });
});
