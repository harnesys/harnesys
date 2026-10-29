import { describe, expect, test } from 'bun:test';
import type { AgentHook } from '@harnesys/contracts';
import { validateAgentHooks } from './agent-hooks.validation.ts';

const CTX = {
  agentId: 'agent-1',
  mcpServers: ['files'],
  agentIds: ['agent-1', 'agent-2'],
};

function hook(overrides: Partial<AgentHook> = {}): AgentHook {
  return {
    id: 'hook-1',
    event: 'PreToolUse',
    handler: { type: 'command', command: 'echo hi' },
    ...overrides,
  };
}

describe('validateAgentHooks', () => {
  test('accepts a valid command hook', () => {
    const result = validateAgentHooks([hook()], CTX);
    expect(result.ok).toBe(true);
  });

  test('rejects an empty command', () => {
    const result = validateAgentHooks([hook({ handler: { type: 'command', command: '  ' } })], CTX);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe('hooks[0].handler.command');
    }
  });

  test('rejects an invalid env key', () => {
    const result = validateAgentHooks(
      [hook({ handler: { type: 'command', command: 'x', env: { 'bad key': '1' } } })],
      CTX,
    );
    expect(result.ok).toBe(false);
  });

  test('rejects a non http url', () => {
    const result = validateAgentHooks([hook({ handler: { type: 'http', url: 'ftp://x' } })], CTX);
    expect(result.ok).toBe(false);
  });

  test('rejects an mcp server that is not connected', () => {
    const result = validateAgentHooks(
      [hook({ handler: { type: 'mcp_tool', server: 'other', tool: 'read' } })],
      CTX,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toContain('mcp server is not connected');
    }
  });

  test('accepts an mcp tool of a connected server', () => {
    const result = validateAgentHooks(
      [hook({ handler: { type: 'mcp_tool', server: 'files', tool: 'read' } })],
      CTX,
    );
    expect(result.ok).toBe(true);
  });

  test('rejects self delegation', () => {
    const result = validateAgentHooks(
      [hook({ handler: { type: 'agent', agentId: 'agent-1', prompt: 'x' } })],
      CTX,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toContain('cannot delegate to itself');
    }
  });

  test('rejects delegation to an unknown agent', () => {
    const result = validateAgentHooks(
      [hook({ handler: { type: 'agent', agentId: 'ghost', prompt: 'x' } })],
      CTX,
    );
    expect(result.ok).toBe(false);
  });

  test('accepts delegation to another agent', () => {
    const result = validateAgentHooks(
      [hook({ handler: { type: 'agent', agentId: 'agent-2', prompt: 'x' } })],
      CTX,
    );
    expect(result.ok).toBe(true);
  });

  test('rejects a matcher on an event without subject', () => {
    const result = validateAgentHooks([hook({ event: 'Stop', matcher: 'anything' })], CTX);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toContain('matcher does not apply');
    }
  });

  test('rejects duplicate hook ids', () => {
    const result = validateAgentHooks([hook({ id: 'a' }), hook({ id: 'a' })], CTX);
    expect(result.ok).toBe(false);
  });

  test('rejects more than fifty hooks', () => {
    const hooks = Array.from({ length: 51 }, (_, index) => hook({ id: `hook-${index}` }));
    const result = validateAgentHooks(hooks, CTX);
    expect(result.ok).toBe(false);
  });

  test('rejects a timeout out of range', () => {
    const result = validateAgentHooks([hook({ timeoutS: 5000 })], CTX);
    expect(result.ok).toBe(false);
  });
});
