import { describe, expect, test } from 'bun:test';
import { pluginAgentId, pluginAgentNameOf, pluginOwnerOfId } from './plugin-agent-utils.ts';

describe('plugin agent id helpers', () => {
  test('id roundtrip keeps owner and agent name', () => {
    const id = pluginAgentId('demo', 'reviewer');
    expect(pluginOwnerOfId(id)).toBe('demo');
    expect(pluginAgentNameOf(id)).toBe('reviewer');
  });

  test('id without separator has no owner', () => {
    expect(pluginOwnerOfId('bare')).toBeUndefined();
  });
});
