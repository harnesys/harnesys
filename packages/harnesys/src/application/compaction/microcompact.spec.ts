import { describe, expect, test } from 'bun:test';
import { CHARS_PER_TOKEN_ESTIMATE } from '../../constants.ts';
import {
  MICROCOMPACT_CLEARED_MARKER,
  MICROCOMPACT_MIN_GAIN_TOKENS,
  microcompactToolResults,
} from './microcompact.ts';

function tool(chars: number): unknown {
  return { role: 'tool', toolCallId: 't', name: 'read_file', content: 'a'.repeat(chars) };
}
function assistant(): unknown {
  return { role: 'assistant', content: 'thinking' };
}
function user(): unknown {
  return { role: 'user', content: 'go' };
}
function history(rounds: number, toolChars = 10_000): unknown[] {
  const out: unknown[] = [user()];
  for (let i = 0; i < rounds; i++) {
    out.push(assistant(), tool(toolChars), user());
  }
  return out;
}
function toolContents(messages: unknown[]): string[] {
  return messages
    .filter((m) => (m as { role: string }).role === 'tool')
    .map((m) => (m as { content: string }).content);
}

describe('microcompactToolResults', () => {
  test('clears a full batch of uncleared rounds behind the kept tail', () => {
    const messages = history(9);
    expect(microcompactToolResults(messages, { keepRounds: 2 })).toBe(true);
    const cleared = toolContents(messages).slice(0, 7);
    const kept = toolContents(messages).slice(7);
    for (const content of cleared) {
      expect(content).toContain(MICROCOMPACT_CLEARED_MARKER);
    }
    for (const content of kept) {
      expect(content).not.toContain(MICROCOMPACT_CLEARED_MARKER);
    }
  });

  test('keeps recent rounds intact when history is short', () => {
    const messages = history(3);
    expect(microcompactToolResults(messages)).toBe(false);
  });

  test('stepped trigger holds until a full step of uncleared rounds accumulates', () => {
    const messages = history(5);
    expect(microcompactToolResults(messages, { keepRounds: 2, stepRounds: 4 })).toBe(false);
    const before = JSON.stringify(messages);
    expect(microcompactToolResults(messages, { keepRounds: 2, stepRounds: 3 })).toBe(true);
    expect(JSON.stringify(messages)).not.toBe(before);
  });

  test('fires again only after another full step accumulates', () => {
    const messages = history(8);
    expect(microcompactToolResults(messages, { keepRounds: 2 })).toBe(true);
    const afterFirst = JSON.stringify(messages);
    messages.push(assistant(), tool(10_000), user());
    expect(microcompactToolResults(messages, { keepRounds: 2 })).toBe(false);
    expect(JSON.stringify(messages.slice(0, 25))).toBe(afterFirst);
    messages.push(assistant(), tool(10_000), user());
    expect(microcompactToolResults(messages, { keepRounds: 2 })).toBe(true);
    const cleared = toolContents(messages).filter((c) => c.includes(MICROCOMPACT_CLEARED_MARKER));
    expect(cleared.length).toBe(8);
  });

  test('skips when the gain is below the token threshold', () => {
    const tiny = Math.floor((MICROCOMPACT_MIN_GAIN_TOKENS * CHARS_PER_TOKEN_ESTIMATE) / 8);
    const messages = history(7, tiny);
    expect(microcompactToolResults(messages, { keepRounds: 2 })).toBe(false);
    for (const content of toolContents(messages)) {
      expect(content).not.toContain(MICROCOMPACT_CLEARED_MARKER);
    }
  });

  test('never clears error results or image media payloads', () => {
    const messages: unknown[] = [
      user(),
      assistant(),
      { role: 'tool', toolCallId: 'e1', name: 'shell', content: 'x'.repeat(20_000), isError: true },
      {
        role: 'tool',
        toolCallId: 'i1',
        name: 'file_read_image',
        content: JSON.stringify({
          ok: true,
          relPath: 'thread:attachments/pic.png',
          mediaType: 'image/png',
          kind: 'image',
        }),
      },
      user(),
      ...history(6),
    ];
    expect(microcompactToolResults(messages, { keepRounds: 2 })).toBe(true);
    expect((messages[2] as { content: string }).content).not.toContain(MICROCOMPACT_CLEARED_MARKER);
    expect((messages[3] as { content: string }).content).not.toContain(MICROCOMPACT_CLEARED_MARKER);
  });

  test('zero minGainTokens disables the gain floor instead of using the default', () => {
    const tiny = Math.floor((MICROCOMPACT_MIN_GAIN_TOKENS * CHARS_PER_TOKEN_ESTIMATE) / 8);
    const messages = history(7, tiny);
    expect(microcompactToolResults(messages, { keepRounds: 2, minGainTokens: 0 })).toBe(true);
  });
});
