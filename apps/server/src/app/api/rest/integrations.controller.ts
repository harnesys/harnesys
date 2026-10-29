import {
  Body,
  type BrixContext,
  Controller,
  Ctx,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@harnesys/brix';
import {
  type DisconnectIntegrationResponse,
  type GithubAppStatusResponse,
  type GithubInstallStartResponse,
  type GithubInstallStatusQuery,
  GithubInstallStatusQuerySchema,
  type GithubInstallStatusResponse,
  type GithubManifestStartBody,
  GithubManifestStartBodySchema,
  type GithubManifestStartResponse,
  type GithubReposQuery,
  GithubReposQuerySchema,
  type GithubReposResponse,
  type GoogleAppConfigBody,
  GoogleAppConfigBodySchema,
  type GoogleAppConfigStatusResponse,
  type GoogleOAuthLoopbackStartResponse,
  type GoogleOAuthStatusQuery,
  GoogleOAuthStatusQuerySchema,
  type GoogleOAuthStatusResponse,
  type GooglePickerSessionQuery,
  GooglePickerSessionQuerySchema,
  type GooglePickerSessionResponse,
  type IntegrationsListResponse,
} from '@harnesys/contracts';
import { DisconnectIntegrationUseCase } from '../../application/integration/disconnect-integration.use-case.ts';
import { GetGoogleAppStatusUseCase } from '../../application/integration/get-google-app-status.use-case.ts';
import { GetGooglePickerSessionUseCase } from '../../application/integration/get-google-picker-session.use-case.ts';
import { GithubAppStatusUseCase } from '../../application/integration/github-app-status.use-case.ts';
import { ListGithubReposUseCase } from '../../application/integration/list-github-repos.use-case.ts';
import { ListIntegrationsUseCase } from '../../application/integration/list-integrations.use-case.ts';
import { PollGithubInstallUseCase } from '../../application/integration/poll-github-install.use-case.ts';
import { PollGoogleOAuthUseCase } from '../../application/integration/poll-google-oauth.use-case.ts';
import { SaveGoogleAppConfigUseCase } from '../../application/integration/save-google-app-config.use-case.ts';
import { StartGithubInstallUseCase } from '../../application/integration/start-github-install.use-case.ts';
import { StartGithubManifestUseCase } from '../../application/integration/start-github-manifest.use-case.ts';
import { StartGoogleOAuthLoopbackUseCase } from '../../application/integration/start-google-oauth-loopback.use-case.ts';

function publicOrigin(ctx: BrixContext): string {
  const forwardedProto = ctx.req.header('x-forwarded-proto');
  const proto = forwardedProto?.split(',')[0]?.trim() || 'http';
  const host = ctx.req.header('host');
  if (host) {
    return `${proto}://${host}`;
  }
  return new URL(ctx.req.url).origin;
}

@Controller('orgs/:orgId/integrations')
export class IntegrationsController {
  constructor(
    private readonly listIntegrations: ListIntegrationsUseCase,
    private readonly disconnectIntegration: DisconnectIntegrationUseCase,
    private readonly startGoogleOAuthLoopback: StartGoogleOAuthLoopbackUseCase,
    private readonly pollGoogleOAuth: PollGoogleOAuthUseCase,
    private readonly getGoogleAppStatus: GetGoogleAppStatusUseCase,
    private readonly saveGoogleAppConfig: SaveGoogleAppConfigUseCase,
    private readonly getGooglePickerSession: GetGooglePickerSessionUseCase,
    private readonly githubStatus: GithubAppStatusUseCase,
    private readonly startGithubInstall: StartGithubInstallUseCase,
    private readonly startGithubManifestFlow: StartGithubManifestUseCase,
    private readonly pollGithubInstall: PollGithubInstallUseCase,
    private readonly listGithubRepos: ListGithubReposUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): IntegrationsListResponse {
    return this.listIntegrations.execute({ orgId });
  }

  @Delete(':integrationId')
  @HttpCode(200)
  disconnect(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
  ): DisconnectIntegrationResponse {
    return this.disconnectIntegration.execute({ orgId, integrationId });
  }

  @Get('google/app')
  googleAppStatus(@Param('orgId') orgId: string): Promise<GoogleAppConfigStatusResponse> {
    return this.getGoogleAppStatus.execute(orgId);
  }

  @Put('google/app')
  @HttpCode(200)
  saveGoogleApp(
    @Param('orgId') orgId: string,
    @Body(GoogleAppConfigBodySchema) body: GoogleAppConfigBody,
  ): Promise<GoogleAppConfigStatusResponse> {
    return this.saveGoogleAppConfig.execute({ orgId, ...body });
  }

  @Post('google/oauth/loopback/start')
  startGoogleDriveOAuthLoopback(
    @Param('orgId') orgId: string,
  ): Promise<GoogleOAuthLoopbackStartResponse> {
    return this.startGoogleOAuthLoopback.execute({ orgId });
  }

  @Get('google/oauth/status')
  googleDriveOAuthStatus(
    @Param('orgId') orgId: string,
    @Query(GoogleOAuthStatusQuerySchema) query: GoogleOAuthStatusQuery,
  ): Promise<GoogleOAuthStatusResponse> {
    return this.pollGoogleOAuth.execute({ orgId, sessionId: query.sessionId });
  }

  @Get('google/picker')
  googleDrivePickerSession(
    @Param('orgId') orgId: string,
    @Query(GooglePickerSessionQuerySchema) query: GooglePickerSessionQuery,
  ): Promise<GooglePickerSessionResponse> {
    return this.getGooglePickerSession.execute({ orgId, integrationId: query.integrationId });
  }

  @Get('github/app-status')
  async githubAppStatus(@Param('orgId') orgId: string): Promise<GithubAppStatusResponse> {
    return this.githubStatus.execute({ orgId });
  }

  @Post('github/install/start')
  @HttpCode(200)
  startGithubInstallation(@Param('orgId') orgId: string): Promise<GithubInstallStartResponse> {
    return this.startGithubInstall.execute({ orgId });
  }

  @Post('github/manifest/start')
  @HttpCode(200)
  startGithubManifest(
    @Param('orgId') orgId: string,
    @Ctx() ctx: BrixContext,
    @Body(GithubManifestStartBodySchema) body: GithubManifestStartBody,
  ): GithubManifestStartResponse {
    return this.startGithubManifestFlow.execute({
      orgId,
      origin: publicOrigin(ctx),
      name: body.name,
    });
  }

  @Get('github/install/status')
  async githubInstallStatus(
    @Param('orgId') orgId: string,
    @Query(GithubInstallStatusQuerySchema) query: GithubInstallStatusQuery,
  ): Promise<GithubInstallStatusResponse> {
    return this.pollGithubInstall.execute({ orgId, sessionId: query.sessionId });
  }

  @Get('github/repos')
  githubRepos(
    @Param('orgId') orgId: string,
    @Query(GithubReposQuerySchema) query: GithubReposQuery,
  ): Promise<GithubReposResponse> {
    return this.listGithubRepos.execute({ orgId, integrationId: query.integrationId });
  }
}
