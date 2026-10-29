import { expect, test } from 'bun:test';
import { ExecutionProfileSchema, UpdateExecutionProfileBodySchema } from './execution-profile.ts';

test('profile schema defaults isolation to host', () => {
  const parsed = ExecutionProfileSchema.parse({
    id: 'local',
    orgId: '8f0e6bd8-0000-4000-8000-000000000000',
    name: 'Local',
    system: true,
    nodeIds: [],
  });
  expect(parsed.isolation).toBe('host');
  expect(parsed.dockerImage).toBeNull();
});

test('container isolation requires dockerImage', () => {
  expect(UpdateExecutionProfileBodySchema.safeParse({ isolation: 'container' }).success).toBe(
    false,
  );
  expect(
    UpdateExecutionProfileBodySchema.safeParse({
      isolation: 'container',
      dockerImage: 'node:22-bookworm',
    }).success,
  ).toBe(true);
});
