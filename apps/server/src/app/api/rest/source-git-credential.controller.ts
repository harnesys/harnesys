import { Controller, Get, Param, Query } from '@harnesys/brix';
import { z } from 'zod';
import { GitCredentialUseCase } from '../../application/source/git-credential.use-case.ts';

const GitCredentialQuerySchema = z.object({
  key: z.string().min(1),
});

/**
 * Git credential helper endpoint. Git invokes it through the credential helper
 * configured on the clone (`applyCredentialHelper`); the opaque `key` stored in
 * the source VCS config is the capability — there is no session auth on this
 * route, and the token is released only on an exact key match.
 */
@Controller('orgs/:orgId/sources/:sourceId/git-credential')
export class SourceGitCredentialController {
  constructor(private readonly credential: GitCredentialUseCase) {}

  @Get()
  async get(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(GitCredentialQuerySchema) query: z.infer<typeof GitCredentialQuerySchema>,
  ): Promise<Response> {
    const token = await this.credential.execute({ orgId, sourceId, key: query.key });
    if (token === null) {
      return new Response(null, { status: 404 });
    }
    return new Response(token, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }
}
