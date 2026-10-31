import { describe, expect, test } from 'bun:test';
import { AskUserInterrupt } from '../domain/errors.ts';
import { PermissionGrantsPort } from '../ports/permission-grants-port.ts';
import { applyPermissionGate, type PermissionGateContext } from './tool-permission.ts';

class FixedGrants extends PermissionGrantsPort {
  constructor(private readonly allowed: boolean) {
    super();
  }

  override async granted(): Promise<boolean> {
    return this.allowed;
  }
}

const call = { name: 'browser', args: {}, id: 'call-1' };

function ctxOf(grants?: PermissionGrantsPort): PermissionGateContext {
  return {
    nodeExecutionId: 'act:0',
    state: {},
    nodeId: 'act',
    agentId: 'agent-1',
    ...(grants !== undefined ? { permissionGrants: grants } : {}),
  };
}

describe('applyPermissionGate durable grants', () => {
  test('durable grant short-circuits the ask', async () => {
    const done = await applyPermissionGate({
      call,
      ctx: ctxOf(new FixedGrants(true)),
      idx: 0,
      operation: 'network',
    });
    expect(done).toBeNull();
  });

  test('without a grant the gate parks the call', async () => {
    expect(
      applyPermissionGate({
        call,
        ctx: ctxOf(new FixedGrants(false)),
        idx: 0,
        operation: 'network',
      }),
    ).rejects.toThrow(AskUserInterrupt);
  });

  test('no port keeps the ask behavior', () => {
    expect(() => applyPermissionGate({ call, ctx: ctxOf(), idx: 0, operation: 'network' })).toThrow(
      AskUserInterrupt,
    );
  });
});
