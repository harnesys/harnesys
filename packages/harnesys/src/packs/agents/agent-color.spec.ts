import { describe, expect, test } from 'bun:test';
import { parseAgentColor } from './agent-color.ts';

describe('parseAgentColor', () => {
  test('accepts a palette name and normalizes case', () => {
    expect(parseAgentColor('blue')).toEqual({ color: 'blue' });
    expect(parseAgentColor('  Purple ')).toEqual({ color: 'purple' });
  });

  test('rejects a name outside the palette with the allowed list', () => {
    const out = parseAgentColor('crimson');
    expect(out.error).toContain('red, orange, yellow, green, blue, purple, magenta, cyan, pink');
  });

  test('rejects hex: agents pick from the interface palette only', () => {
    expect(parseAgentColor('#ef4444').error).toBeDefined();
  });

  test('omitted color is fine', () => {
    expect(parseAgentColor(undefined)).toEqual({});
    expect(parseAgentColor(null)).toEqual({});
  });
});
