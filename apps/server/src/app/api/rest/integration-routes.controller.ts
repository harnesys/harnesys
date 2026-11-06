import {
  type BrixContext,
  Controller,
  Ctx,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@harnesys/brix';
import { IntegrationHostPort } from '../../domain/integration/integration-host.port.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

type AddonMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/integrations/:integrationId')
export class IntegrationRoutesController {
  constructor(private readonly host: IntegrationHostPort) {}

  @Get('*')
  get(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.proxy(orgId, integrationId, 'GET', ctx);
  }

  @Post('*')
  post(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.proxy(orgId, integrationId, 'POST', ctx);
  }

  @Patch('*')
  patch(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.proxy(orgId, integrationId, 'PATCH', ctx);
  }

  @Put('*')
  put(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.proxy(orgId, integrationId, 'PUT', ctx);
  }

  @Delete('*')
  remove(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.proxy(orgId, integrationId, 'DELETE', ctx);
  }

  private async proxy(
    orgId: string,
    integrationId: string,
    method: AddonMethod,
    ctx: BrixContext,
  ): Promise<Response> {
    const body = method === 'GET' ? null : await ctx.req.json().catch(() => null);
    return await this.host.handle({
      orgId,
      integrationId,
      method,
      pathname: addonPathnameOf(ctx.req.path, integrationId),
      query: queryOf(ctx.req.url),
      body,
    });
  }
}

function addonPathnameOf(path: string, integrationId: string): string {
  const marker = `/integrations/${integrationId}/`;
  const index = path.indexOf(marker);
  if (index < 0) {
    return '/';
  }
  return `/${path.slice(index + marker.length)}`;
}

function queryOf(url: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of new URL(url).searchParams) {
    query[key] = value;
  }
  return query;
}
