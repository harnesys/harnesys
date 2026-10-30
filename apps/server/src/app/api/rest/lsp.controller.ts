import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@harnesys/brix';
import type { OrgLspListResponse, UpsertOrgLspServerBody } from '@harnesys/contracts';
import { UpsertOrgLspServerBodySchema } from '@harnesys/contracts';
import { SSE_KEEP_ALIVE_MS } from '../../../const.ts';
import { DeleteOrgLspServerUseCase } from '../../application/lsp/delete-org-lsp-server.use-case.ts';
import { GetOrgLspUseCase } from '../../application/lsp/get-org-lsp.use-case.ts';
import { GetSourceLspUseCase } from '../../application/lsp/get-source-lsp.use-case.ts';
import { InstallOrgLspBinaryUseCase } from '../../application/lsp/install-org-lsp-binary.use-case.ts';
import { LspQueryUseCase } from '../../application/lsp/lsp-query.use-case.ts';
import {
  LspDefinitionUseCase,
  LspDiagnosticsUseCase,
  LspEventsQuerySchema,
  LspHoverUseCase,
  type LspQueryBody,
  LspQuerySchema,
  LspReferencesUseCase,
} from '../../application/lsp/lsp-query.use-cases.ts';
import { PutOrgLspUseCase } from '../../application/lsp/put-org-lsp.use-case.ts';
import { PutSourceLspUseCase } from '../../application/lsp/put-source-lsp.use-case.ts';
import { RestartOrgLspServerUseCase } from '../../application/lsp/restart-org-lsp-server.use-case.ts';
import { SetOrgLspServerStateUseCase } from '../../application/lsp/set-org-lsp-server-state.use-case.ts';
import { UpsertOrgLspServerUseCase } from '../../application/lsp/upsert-org-lsp-server.use-case.ts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';

@Controller()
export class LspController {
  constructor(
    private readonly getOrgLsp: GetOrgLspUseCase,
    private readonly putOrgLsp: PutOrgLspUseCase,
    private readonly upsertServer: UpsertOrgLspServerUseCase,
    private readonly deleteServer: DeleteOrgLspServerUseCase,
    private readonly installBinary: InstallOrgLspBinaryUseCase,
    private readonly restartServer: RestartOrgLspServerUseCase,
    private readonly setServerState: SetOrgLspServerStateUseCase,
    private readonly getSourceLsp: GetSourceLspUseCase,
    private readonly putSourceLsp: PutSourceLspUseCase,
    private readonly lspDiagnostics: LspDiagnosticsUseCase,
    private readonly lspHover: LspHoverUseCase,
    private readonly lspDefinition: LspDefinitionUseCase,
    private readonly lspReferences: LspReferencesUseCase,
    private readonly lspQuery: LspQueryUseCase,
    private readonly lsp: LspPort,
  ) {}

  @Get('orgs/:orgId/lsp')
  async orgList(@Param('orgId') orgId: string): Promise<OrgLspListResponse> {
    return await this.getOrgLsp.execute({ orgId });
  }

  @Put('orgs/:orgId/lsp')
  orgPut(@Param('orgId') orgId: string, @Body() body: unknown): OrgLspListResponse {
    return this.putOrgLsp.execute({ orgId, body });
  }

  @Put('orgs/:orgId/lsp/servers/:serverId')
  orgServerUpsert(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
    @Body(UpsertOrgLspServerBodySchema) body: UpsertOrgLspServerBody,
  ): Promise<OrgLspListResponse> {
    return this.upsertServer.execute({ orgId, serverId, body });
  }

  @Delete('orgs/:orgId/lsp/servers/:serverId')
  @HttpCode(204)
  orgServerRemove(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
  ): Promise<void> {
    return this.deleteServer.execute({ orgId, serverId });
  }

  @Post('orgs/:orgId/lsp/servers/:serverId/install-binary')
  orgInstallBinary(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
  ): Promise<OrgLspListResponse> {
    return this.installBinary.execute({ orgId, serverId });
  }

  @Post('orgs/:orgId/lsp/:serverId/restart')
  async orgRestart(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
  ): Promise<OrgLspListResponse> {
    return await this.restartServer.execute({ orgId, serverId });
  }

  @Post('orgs/:orgId/lsp/:serverId/stop')
  async orgStop(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
  ): Promise<OrgLspListResponse> {
    return await this.setServerState.execute({ orgId, serverId, disabled: true });
  }

  @Post('orgs/:orgId/lsp/:serverId/enable')
  async orgEnable(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
  ): Promise<OrgLspListResponse> {
    return await this.setServerState.execute({ orgId, serverId, disabled: false });
  }

  @Get('orgs/:orgId/sources/:sourceId/lsp')
  async sourceList(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<OrgLspListResponse> {
    return await this.getSourceLsp.execute({ orgId, sourceId });
  }

  @Put('orgs/:orgId/sources/:sourceId/lsp')
  sourcePut(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
  ): OrgLspListResponse {
    return this.putSourceLsp.execute({ orgId, sourceId, body });
  }

  @Post('orgs/:orgId/lsp/diagnostics')
  diagnostics(
    @Param('orgId') orgId: string,
    @Body(LspQuerySchema) body: LspQueryBody,
  ): Promise<unknown> {
    return this.lspDiagnostics.execute({ ...body, orgId });
  }

  @Post('orgs/:orgId/lsp/hover')
  hover(@Param('orgId') orgId: string, @Body(LspQuerySchema) body: LspQueryBody): Promise<unknown> {
    return this.lspHover.execute({ ...body, orgId });
  }

  @Post('orgs/:orgId/lsp/definition')
  definition(
    @Param('orgId') orgId: string,
    @Body(LspQuerySchema) body: LspQueryBody,
  ): Promise<unknown> {
    return this.lspDefinition.execute({ ...body, orgId });
  }

  @Post('orgs/:orgId/lsp/references')
  references(
    @Param('orgId') orgId: string,
    @Body(LspQuerySchema) body: LspQueryBody,
  ): Promise<unknown> {
    return this.lspReferences.execute({ ...body, orgId });
  }

  @Get('orgs/:orgId/lsp/events')
  events(
    @Param('orgId') orgId: string,
    @Query(LspEventsQuerySchema) query: { sourceId: string },
  ): Response {
    const lsp = this.lsp;
    const sourceRoot = this.lspQuery.sourceRoot({ orgId, sourceId: query.sourceId });
    const encoder = new TextEncoder();
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (data: string) => {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };
        unsubscribe = lsp.onDiagnostics(orgId, (frame) => {
          if (frame.cwd === sourceRoot) {
            write(JSON.stringify(frame));
          }
        });
        keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } catch {
            clearInterval(keepAlive);
          }
        }, SSE_KEEP_ALIVE_MS);
      },
      cancel() {
        clearInterval(keepAlive);
        unsubscribe?.();
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  }
}
