import { describe, expect, test } from 'bun:test';
import type { AgentHook } from '@harnesys/contracts';
import {
  hookGateStatus,
  hookIdOf,
  hookRequiredPermission,
  resolveHookBindings,
} from './hook-gate.ts';

function hook(overrides: Partial<AgentHook> = {}): AgentHook {
  return {
    id: 'hook-1',
    event: 'PreToolUse',
    handler: { type: 'command', command: 'echo hi' },
    ...overrides,
  };
}

describe('hookRequiredPermission', () => {
  test('maps handler types to permission operations', () => {
    expect(hookRequiredPermission('command')).toBe('process');
    expect(hookRequiredPermission('http')).toBe('network');
    expect(hookRequiredPermission('mcp_tool')).toBe('mcp');
    expect(hookRequiredPermission('agent')).toBe('agents');
    expect(hookRequiredPermission('prompt')).toBeUndefined();
  });
});

describe('hookGateStatus', () => {
  test('prompt hooks are always granted', () => {
    const status = hookGateStatus({ type: 'prompt', prompt: 'x' }, { process: 'deny' });
    expect(status.status).toBe('granted');
  });

  test('command hook needs process allow', () => {
    expect(hookGateStatus({ type: 'command', command: 'x' }, { process: 'allow' }).status).toBe(
      'granted',
    );
    const denied = hookGateStatus({ type: 'command', command: 'x' }, { process: 'ask' });
    expect(denied.status).toBe('denied');
    expect(denied.reason).toContain('Process');
  });

  test('missing permission is treated as ask', () => {
    const status = hookGateStatus({ type: 'http', url: 'https://example.com' }, undefined);
    expect(status.status).toBe('denied');
  });
});

describe('resolveHookBindings', () => {
  test('binds allowed hooks and drops denied ones', () => {
    const result = resolveHookBindings(
      [
        hook({ id: 'a', handler: { type: 'command', command: 'x' } }),
        hook({ id: 'b', handler: { type: 'http', url: 'https://example.com' } }),
      ],
      { agentId: 'agent-1', root: '/tmp', permissions: { process: 'allow', network: 'deny' } },
    );
    expect(result.bindings.map((binding) => binding.id)).toEqual(['a']);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]?.hookId).toBe('b');
    expect(result.dropped[0]?.reason).toContain('Network');
  });

  test('disabled hooks are dropped with a reason', () => {
    const result = resolveHookBindings([hook({ enabled: false })], {
      agentId: 'agent-1',
      root: '/tmp',
      permissions: { process: 'allow' },
    });
    expect(result.bindings).toHaveLength(0);
    expect(result.dropped[0]?.reason).toBe('disabled');
  });

  test('bindings carry origin, root vars and matcher', () => {
    const result = resolveHookBindings([hook({ matcher: 'Bash' })], {
      agentId: 'agent-1',
      root: '/tmp',
      permissions: { process: 'allow' },
    });
    const binding = result.bindings[0];
    expect(binding?.origin).toBe('agent');
    expect(binding?.matcher).toBe('Bash');
    expect(binding?.vars.pluginRoot).toBe('/tmp');
  });
});

describe('hookIdOf', () => {
  test('uses the hook id when present', () => {
    expect(hookIdOf(hook({ id: 'x' }), 'agent-1', 3)).toBe('x');
  });

  test('falls back to agent, event and index', () => {
    expect(hookIdOf(hook({ id: undefined }), 'agent-1', 3)).toBe('agent-1:PreToolUse:3');
  });
});
