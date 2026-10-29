import { describe, expect, test } from 'bun:test';
import { DEFAULT_MIRROR_POLICY } from './constants.ts';
import { planProjection } from './project-event.ts';

describe('planProjection', () => {
  test('echo skip, app prefix, ask buttons, tool skip, failed line', () => {
    expect(
      planProjection(
        DEFAULT_MIRROR_POLICY,
        { type: 'user', text: 'hi', origin: 'connector:c1', connectorId: 'c1' },
        null,
      ),
    ).toEqual({ type: 'skip' });

    expect(
      planProjection(
        DEFAULT_MIRROR_POLICY,
        { type: 'user', text: 'hi', origin: 'web', connectorId: 'c1' },
        null,
      ),
    ).toEqual({ type: 'echo', text: 'You · Harnesys\n\nhi' });

    expect(
      planProjection(
        DEFAULT_MIRROR_POLICY,
        {
          type: 'ask',
          askId: 'a1',
          source: 'ask_user',
          prompt: 'Pick',
          schema: { enum: ['red', 'blue'] },
        },
        null,
      ),
    ).toEqual({
      type: 'ask',
      interruptId: 'a1',
      text: 'Pick',
      buttons: [
        { label: 'red', value: 'red' },
        { label: 'blue', value: 'blue' },
      ],
    });

    expect(
      planProjection(
        DEFAULT_MIRROR_POLICY,
        { type: 'ask', askId: 'a2', source: 'permission', prompt: 'Allow?' },
        null,
      ),
    ).toEqual({
      type: 'ask',
      interruptId: 'a2',
      text: 'Allow?',
      buttons: [
        { label: 'Approve', value: 'approve' },
        { label: 'Deny', value: 'deny' },
      ],
    });

    expect(planProjection(DEFAULT_MIRROR_POLICY, { type: 'tool' }, null)).toEqual({
      type: 'skip',
    });

    expect(
      planProjection(DEFAULT_MIRROR_POLICY, { type: 'run.failed', message: 'boom' }, null),
    ).toEqual({ type: 'failed', text: 'Run failed: boom' });
  });

  test('shell ask renders once/always/deny buttons, others stay approve/deny', () => {
    expect(
      planProjection(
        DEFAULT_MIRROR_POLICY,
        {
          type: 'ask',
          askId: 's1',
          source: 'permission',
          prompt: 'Allow?',
          tool: { name: 'shell', input: { command: 'git status' } },
        },
        null,
      ),
    ).toEqual({
      type: 'ask',
      interruptId: 's1',
      text: 'Allow?',
      buttons: [
        { label: 'Once', value: 'approve_once' },
        { label: 'Always', value: 'always' },
        { label: 'Deny', value: 'deny' },
      ],
    });

    expect(
      planProjection(
        DEFAULT_MIRROR_POLICY,
        {
          type: 'ask',
          askId: 's2',
          source: 'permission',
          prompt: 'Allow?',
          tool: { name: 'write_file', input: { path: 'a.txt' } },
        },
        null,
      ),
    ).toEqual({
      type: 'ask',
      interruptId: 's2',
      text: 'Allow?',
      buttons: [
        { label: 'Approve', value: 'approve' },
        { label: 'Deny', value: 'deny' },
      ],
    });
  });
});
