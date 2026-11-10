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
import { AddonException } from '../../domain/addons/errors.ts';
import { AddonCallPort } from '../../domain/addons/ports/addon-call.port.ts';
import type { AddonRouteMatch } from '../../domain/addons/ports/route-table.port.ts';
import { AddonRouteTablePort } from '../../domain/addons/ports/route-table.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import { PRINCIPAL_CONTEXT_KEY } from '../guards/session.guard.ts';

export type RouteHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons/:addonId/r')
export class AddonRoutesController {
  constructor(
    private readonly routes: AddonRouteTablePort,
    private readonly calls: AddonCallPort,
  ) {}

  @Get('*')
  async get(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return await this.handle(orgId, addonId, ctx, 'GET');
  }

  @Post('*')
  async post(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return await this.handle(orgId, addonId, ctx, 'POST');
  }

  @Put('*')
  async put(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return await this.handle(orgId, addonId, ctx, 'PUT');
  }

  @Patch('*')
  async patch(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return await this.handle(orgId, addonId, ctx, 'PATCH');
  }

  @Delete('*')
  async delete(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return await this.handle(orgId, addonId, ctx, 'DELETE');
  }

  private async handle(
    orgId: string,
    addonId: string,
    ctx: BrixContext,
    method: RouteHttpMethod,
  ): Promise<Response> {
    const request = ctx.req.raw;
    const callerRole = this.callerRoleOf(ctx, orgId);
    const url = new URL(request.url);
    const marker = `/addons/${addonId}/r/`;
    const markerIndex = url.pathname.indexOf(marker);
    const subPath = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : '';
    const resolved = this.routes.resolve(orgId, addonId, method, subPath);
    if (!resolved) {
      throw new AddonException('not_found', 404, `Addon route not found: ${method} /${subPath}`);
    }
    this.assertRole(resolved, callerRole);
    const body = await this.readBody(request, resolved.bodyLimitKb);
    const result = await this.calls.callRoute(orgId, addonId, {
      routeId: resolved.routeId,
      request: {
        method,
        path: subPath,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: Object.fromEntries(request.headers.entries()),
        ...(body === undefined ? {} : { body }),
      },
    });
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status,
      headers: { 'Content-Type': 'application/json', ...(result.headers ?? {}) },
    });
  }

  private callerRoleOf(ctx: BrixContext, orgId: string): 'member' | 'admin' {
    const principal = ctx.get(PRINCIPAL_CONTEXT_KEY) as Principal | undefined;
    if (principal && authorize(principal, 'org.update', { orgId })) {
      return 'admin';
    }
    return 'member';
  }

  private assertRole(resolved: AddonRouteMatch, callerRole: 'member' | 'admin'): void {
    if (resolved.role === 'admin' && callerRole !== 'admin') {
      throw new AddonException('permission_denied', 403, 'Admin role required for this route');
    }
  }

  private async readBody(request: Request, bodyLimitKb: number): Promise<unknown> {
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > bodyLimitKb * 1024) {
      throw new AddonException('invalid_params', 413, `Request body exceeds ${bodyLimitKb} KiB`);
    }
    if (contentLength === 0) {
      return undefined;
    }
    const text = await request.text();
    if (Buffer.byteLength(text) > bodyLimitKb * 1024) {
      throw new AddonException('invalid_params', 413, `Request body exceeds ${bodyLimitKb} KiB`);
    }
    try {
      const parsed: unknown = text.length === 0 ? undefined : JSON.parse(text);
      return parsed;
    } catch {
      return text;
    }
  }
}
