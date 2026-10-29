import { expect, test } from 'bun:test';
import { CreateFileRuleBodySchema, FileRulePublicSchema } from './file-access.ts';

test('file rule schemas validate allow/deny over read/edit', () => {
  const parsed = CreateFileRuleBodySchema.parse({
    pathPattern: '/Users/mike/project/**',
    action: 'read',
    effect: 'allow',
  });
  expect(parsed.agentId).toBeUndefined();
  expect(parsed.hostId).toBeUndefined();
  expect(
    CreateFileRuleBodySchema.safeParse({ pathPattern: '*', action: 'write', effect: 'allow' })
      .success,
  ).toBe(false);
  expect(
    FileRulePublicSchema.safeParse({
      id: '44444444-4444-4444-8444-00000000000a',
      orgId: '8f0e6bd8-0000-4000-8000-000000000000',
      agentId: null,
      hostId: null,
      pathPattern: '**/secret/**',
      action: 'edit',
      effect: 'deny',
      createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z',
    }).success,
  ).toBe(true);
});
