import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@harnesys/brix';
import { SSE_KEEP_ALIVE_MS } from '../../../const.ts';
import { AddBrowserAllowlistUseCase } from '../../application/use-cases/browser/add-browser-allowlist.use-case.ts';
import { CheckAgentBrowserUpdateUseCase } from '../../application/use-cases/browser/check-agent-browser-update.use-case.ts';
import { GetOrgBrowserUseCase } from '../../application/use-cases/browser/get-org-browser.use-case.ts';
import { InstallAgentBrowserToolUseCase } from '../../application/use-cases/browser/install-agent-browser-tool.use-case.ts';
import { InstallBrowserEngineUseCase } from '../../application/use-cases/browser/install-browser-engine.use-case.ts';
import { ListBrowserEngineVersionsUseCase } from '../../application/use-cases/browser/list-browser-engine-versions.use-case.ts';
import { PutBrowserSettingsUseCase } from '../../application/use-cases/browser/put-browser-settings.use-case.ts';
import { RemoveBrowserEngineUseCase } from '../../application/use-cases/browser/remove-browser-engine.use-case.ts';
import { SetBrowserEngineStateUseCase } from '../../application/use-cases/browser/set-browser-engine-state.use-case.ts';
import type {
  BrowserAllowlistBody,
  BrowserEngineRemoveQuery,
  BrowserEngineStateBody,
  BrowserInstallBody,
  BrowserSettingsBody,
  BrowserToolInstallBody,
  BrowserUpdateCheckBody,
  BrowserVersionsQuery,
} from './browser.schema.ts';
import {
  BrowserAllowlistSchema,
  BrowserEngineRemoveQuerySchema,
  BrowserEngineStateSchema,
  BrowserInstallSchema,
  BrowserSettingsSchema,
  BrowserToolInstallSchema,
  BrowserUpdateCheckSchema,
  BrowserVersionsQuerySchema,
} from './browser.schema.ts';

@Controller()
export class BrowserController {
  constructor(
    private readonly getOrgBrowser: GetOrgBrowserUseCase,
    private readonly installEngine: InstallBrowserEngineUseCase,
    private readonly putSettings: PutBrowserSettingsUseCase,
    private readonly addAllowlist: AddBrowserAllowlistUseCase,
    private readonly setEngineState: SetBrowserEngineStateUseCase,
    private readonly removeEngine: RemoveBrowserEngineUseCase,
    private readonly installAgentBrowserTool: InstallAgentBrowserToolUseCase,
    private readonly checkAgentBrowserUpdate: CheckAgentBrowserUpdateUseCase,
    private readonly listEngineVersions: ListBrowserEngineVersionsUseCase,
  ) {}

  @Get('orgs/:orgId/browser')
  orgBrowser(@Param('orgId') orgId: string): Promise<unknown> {
    return this.getOrgBrowser.execute({ orgId });
  }

  @Put('orgs/:orgId/browser/settings')
  orgSettings(
    @Param('orgId') orgId: string,
    @Body(BrowserSettingsSchema) body: BrowserSettingsBody,
  ): { defaultEngine: string } {
    return this.putSettings.execute({ orgId, defaultEngine: body.defaultEngine });
  }

  @Post('orgs/:orgId/browser/allowlist')
  orgAllowlist(
    @Param('orgId') orgId: string,
    @Body(BrowserAllowlistSchema) body: BrowserAllowlistBody,
  ): Promise<{ engineId: string }> {
    return this.addAllowlist.execute({ orgId, hostId: body.hostId, engineId: body.engineId });
  }

  @Put('orgs/:orgId/browser/engines/:engineId/state')
  orgEngineState(
    @Param('orgId') orgId: string,
    @Param('engineId') engineId: string,
    @Body(BrowserEngineStateSchema) body: BrowserEngineStateBody,
  ): Promise<{ engineId: string; enabled: boolean }> {
    return this.setEngineState.execute({
      orgId,
      hostId: body.hostId,
      engineId,
      enabled: body.enabled,
    });
  }

  @Delete('orgs/:orgId/browser/engines/:engineId')
  orgEngineRemove(
    @Param('orgId') orgId: string,
    @Param('engineId') engineId: string,
    @Query(BrowserEngineRemoveQuerySchema) query: BrowserEngineRemoveQuery,
  ): Promise<{ engineId: string }> {
    return this.removeEngine.execute({ orgId, hostId: query.hostId, engineId });
  }

  @Get('orgs/:orgId/browser/engines/:engineId/versions')
  orgEngineVersions(
    @Param('orgId') orgId: string,
    @Param('engineId') engineId: string,
    @Query(BrowserVersionsQuerySchema) query: BrowserVersionsQuery,
  ): Promise<{ versions: unknown[] }> {
    return this.listEngineVersions.execute({ orgId, hostId: query.hostId, engineId });
  }

  @Post('orgs/:orgId/browser/tools/agent-browser/check-update')
  orgCheckAgentBrowserUpdate(
    @Param('orgId') orgId: string,
    @Body(BrowserUpdateCheckSchema) body: BrowserUpdateCheckBody,
  ): Promise<{ installed: string | null; latest: string; updateAvailable: boolean }> {
    return this.checkAgentBrowserUpdate.execute({ orgId, hostId: body.hostId });
  }

  @Post('orgs/:orgId/browser/tools/agent-browser/install')
  async orgInstallAgentBrowser(
    @Param('orgId') orgId: string,
    @Body(BrowserToolInstallSchema) body: BrowserToolInstallBody,
  ): Promise<{ path: string; version: string; commands: string[] }> {
    return await this.installAgentBrowserTool.execute({
      orgId,
      hostId: body.hostId,
      version: body.version,
    });
  }

  @Post('orgs/:orgId/browser/install')
  orgInstall(
    @Param('orgId') orgId: string,
    @Body(BrowserInstallSchema) body: BrowserInstallBody,
  ): Response {
    const encoder = new TextEncoder();
    const install = this.installEngine;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } catch {
            clearInterval(keepAlive);
          }
        }, SSE_KEEP_ALIVE_MS);
        void install
          .execute(
            {
              orgId,
              hostId: body.hostId,
              engine: body.engine,
              stealth: body.stealth,
              version: body.version,
            },
            (progress) => write('progress', progress),
          )
          .then(() => {
            write('done', { ok: true });
          })
          .catch((error: unknown) => {
            write('error', { message: error instanceof Error ? error.message : 'install failed' });
          })
          .finally(() => {
            clearInterval(keepAlive);
            controller.close();
          });
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
