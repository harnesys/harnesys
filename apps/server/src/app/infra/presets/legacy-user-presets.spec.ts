import { describe, expect, test } from 'bun:test';
import { parseLegacyAgentPreset } from './legacy-user-presets.ts';

describe('parseLegacyAgentPreset', () => {
  test('parses a valid legacy agent preset', () => {
    const record = parseLegacyAgentPreset(
      'lead.json',
      JSON.stringify({ name: 'Lead', role: 'Manager', instructions: 'coordinate' }),
    );
    expect(record?.id).toBe('local/lead');
    expect(record?.kind).toBe('agent');
    expect(record?.origin).toBe('user');
    expect(record?.installedFrom).toBe('file');
    expect(record?.name).toBe('Lead');
  });

  test('rejects broken json and invalid bodies', () => {
    expect(parseLegacyAgentPreset('lead.json', '{not json')).toBeNull();
    expect(parseLegacyAgentPreset('lead.json', JSON.stringify({ name: '' }))).toBeNull();
  });
});
