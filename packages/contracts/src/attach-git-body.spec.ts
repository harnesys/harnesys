import { describe, expect, test } from 'bun:test';
import { AttachGitBodySchema } from './source.ts';

const ACCOUNT_ID = '5b6f9a1e-0e6b-4a7a-9d8e-2b1c3d4e5f60';

describe('AttachGitBodySchema guard', () => {
  test('accepts inline url+credRef and accountId+repo, rejects mixes', () => {
    expect(
      AttachGitBodySchema.safeParse({ url: 'https://github.com/owner/name.git' }).success,
    ).toBe(true);
    expect(
      AttachGitBodySchema.safeParse({ accountId: ACCOUNT_ID, repo: 'owner/name' }).success,
    ).toBe(true);

    const both = AttachGitBodySchema.safeParse({
      url: 'https://github.com/owner/name.git',
      accountId: ACCOUNT_ID,
      repo: 'owner/name',
    });
    expect(both.success).toBe(false);

    const accountWithCred = AttachGitBodySchema.safeParse({
      accountId: ACCOUNT_ID,
      repo: 'owner/name',
      credRef: 'secret',
    });
    expect(accountWithCred.success).toBe(false);

    const accountWithoutRepo = AttachGitBodySchema.safeParse({ accountId: ACCOUNT_ID });
    expect(accountWithoutRepo.success).toBe(false);

    const badRepo = AttachGitBodySchema.safeParse({ accountId: ACCOUNT_ID, repo: 'not-a-repo' });
    expect(badRepo.success).toBe(false);
  });
});
