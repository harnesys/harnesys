import { describe, expect, test } from 'bun:test';
import { parseLegacyAgentPreset } from './legacy-user-presets.ts';

describe('parseLegacyAgentPreset', () => {
  test('parses a valid legacy agent preset', () => {
    const record = parseLegacyAgentPreset(
      'jarvis.json',
      JSON.stringify({ name: 'Jarvis', role: 'Manager', instructions: 'coordinate' }),
    );
    expect(record?.id).toBe('local/jarvis');
    expect(record?.kind).toBe('agent');
    expect(record?.origin).toBe('user');
    expect(record?.installedFrom).toBe('file');
    expect(record?.name).toBe('Jarvis');
  });

  test('rejects broken json and invalid bodies', () => {
    expect(parseLegacyAgentPreset('jarvis.json', '{not json')).toBeNull();
    expect(parseLegacyAgentPreset('jarvis.json', JSON.stringify({ name: '' }))).toBeNull();
  });
});
