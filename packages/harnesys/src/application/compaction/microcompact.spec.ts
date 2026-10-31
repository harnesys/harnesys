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

describe('microcompactToolResults', () => {
  test('clears tool results older than the kept assistant rounds', () => {
    const messages = history(7);
    expect(microcompactToolResults(messages)).toBe(true);
    const tools = messages.filter((m) => (m as { role: string }).role === 'tool');
    const cleared = tools.slice(0, 2);
    const kept = tools.slice(2);
    for (const t of cleared) {
      expect((t as { content: string }).content).toContain(MICROCOMPACT_CLEARED_MARKER);
    }
    for (const t of kept) {
      expect((t as { content: string }).content).not.toContain(MICROCOMPACT_CLEARED_MARKER);
    }
  });

  test('keeps recent rounds intact when history is short', () => {
    const messages = history(3);
    expect(microcompactToolResults(messages)).toBe(false);
  });

  test('skips when the gain is below the token threshold', () => {
    const tiny = Math.floor((MICROCOMPACT_MIN_GAIN_TOKENS * CHARS_PER_TOKEN_ESTIMATE) / 8);
    const messages = history(7, tiny);
    expect(microcompactToolResults(messages)).toBe(false);
    for (const m of messages) {
      if ((m as { role: string }).role === 'tool') {
        expect((m as { content: string }).content).not.toContain(MICROCOMPACT_CLEARED_MARKER);
      }
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
    expect(microcompactToolResults(messages)).toBe(true);
    expect((messages[2] as { content: string }).content).not.toContain(MICROCOMPACT_CLEARED_MARKER);
    expect((messages[3] as { content: string }).content).not.toContain(MICROCOMPACT_CLEARED_MARKER);
  });
});
