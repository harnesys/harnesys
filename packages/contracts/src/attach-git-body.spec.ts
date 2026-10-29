import { describe, expect, test } from 'bun:test';
import { AttachGitBodySchema } from './source.ts';

const UUID = '5b6f9a1e-0e6b-4a7a-9d8e-2b1c3d4e5f60';

describe('AttachGitBodySchema guard', () => {
  test('accepts inline url+credRef and integrationId+repo, rejects mixes', () => {
    expect(
      AttachGitBodySchema.safeParse({ url: 'https://github.com/owner/name.git' }).success,
    ).toBe(true);
    expect(AttachGitBodySchema.safeParse({ integrationId: UUID, repo: 'owner/name' }).success).toBe(
      true,
    );

    const both = AttachGitBodySchema.safeParse({
      url: 'https://github.com/owner/name.git',
      integrationId: UUID,
      repo: 'owner/name',
    });
    expect(both.success).toBe(false);

    const integrationWithCred = AttachGitBodySchema.safeParse({
      integrationId: UUID,
      repo: 'owner/name',
      credRef: 'secret',
    });
    expect(integrationWithCred.success).toBe(false);

    const integrationWithoutRepo = AttachGitBodySchema.safeParse({ integrationId: UUID });
    expect(integrationWithoutRepo.success).toBe(false);

    const badRepo = AttachGitBodySchema.safeParse({ integrationId: UUID, repo: 'not-a-repo' });
    expect(badRepo.success).toBe(false);
  });
});
