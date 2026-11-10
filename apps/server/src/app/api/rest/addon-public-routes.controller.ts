import {
  type BrixContext,
  Controller,
  Ctx,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Public,
  Put,
} from '@harnesys/brix';
import { AddonException } from '../../domain/addons/errors.ts';
import { coversGrant } from '../../domain/addons/host-service.ts';
import type { EffectiveGrants } from '../../domain/addons/permissions.ts';
import { AddonCallPort } from '../../domain/addons/ports/addon-call.port.ts';
import type { OrgAddonRow } from '../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import { AddonRouteTablePort } from '../../domain/addons/ports/route-table.port.ts';

const MAX_PUBLIC_BODY_KB = 64;
const ROUTES_PUBLIC_PERMISSION = 'routes.public';
const PUBLIC_MARKER = '/addons/public/';

@Public()
@Controller('api/addons/public/:orgId/:addonId/r')
export class AddonPublicRoutesController {
  constructor(
    private readonly routes: AddonRouteTablePort,
    private readonly calls: AddonCallPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
  ) {}

  @Get('*')
  get(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.handle(orgId, addonId, ctx, 'GET');
  }

  @Post('*')
  post(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.handle(orgId, addonId, ctx, 'POST');
  }

  @Put('*')
  put(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.handle(orgId, addonId, ctx, 'PUT');
  }

  @Patch('*')
  patch(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.handle(orgId, addonId, ctx, 'PATCH');
  }

  @Delete('*')
  delete(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Response> {
    return this.handle(orgId, addonId, ctx, 'DELETE');
  }

  private async handle(
    orgId: string,
    addonId: string,
    ctx: BrixContext,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  ): Promise<Response> {
    const request = ctx.req.raw;
    const row = this.orgAddons.find(orgId, addonId);
    if (!row?.enabled) {
      throw new AddonException('not_found', 404, `Addon is not enabled: ${addonId}`);
    }
    this.assertPublicGrant(row);
    const url = new URL(request.url);
    const subPath = this.subPathOf(url.pathname, addonId);
    const resolved = this.routes.resolve(orgId, addonId, method, subPath);
    if (resolved?.exposure !== 'public') {
      throw new AddonException(
        'not_found',
        404,
        `Public addon route not found: ${method} /${subPath}`,
      );
    }
    const body = await this.readBody(request, Math.min(resolved.bodyLimitKb, MAX_PUBLIC_BODY_KB));
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

  private assertPublicGrant(row: OrgAddonRow): void {
    const grants = this.parseGrants(row.grantsJson);
    if (!coversGrant(grants as EffectiveGrants, ROUTES_PUBLIC_PERMISSION)) {
      throw new AddonException('permission_denied', 403, 'routes.public is not granted');
    }
  }

  private parseGrants(grantsJson: string): Array<{ id: string }> {
    try {
      const parsed: unknown = JSON.parse(grantsJson);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (entry): entry is { id: string } =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as { id?: unknown }).id === 'string',
      );
    } catch {
      return [];
    }
  }

  private subPathOf(pathname: string, addonId: string): string {
    const marker = `${PUBLIC_MARKER}${addonId}/r/`;
    const index = pathname.indexOf(marker);
    return index >= 0 ? pathname.slice(index + marker.length) : '';
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
      return text.length === 0 ? undefined : JSON.parse(text);
    } catch {
      return text;
    }
  }
}
