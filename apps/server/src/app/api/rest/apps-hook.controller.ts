import { Controller, Delete, Get, Param, Patch, Post, Public, Put } from '@harnesys/brix';
import { HandleWebhookUseCase } from '../../application/apps/webhooks/handle-webhook.use-case.ts';
import type { WebhookRequestData } from './apps-request.ts';
import { WebhookRequest } from './apps-request.ts';
import { appsResponse } from './apps-response.ts';

@Public()
@Controller('apps/hook')
export class AppsHookController {
  constructor(private readonly webhooks: HandleWebhookUseCase) {}

  @Post(':orgId/apps/:appId')
  postApp(
    @Param('orgId') orgId: string,
    @Param('appId') appId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'app', appId, request);
  }

  @Get(':orgId/apps/:appId')
  getApp(
    @Param('orgId') orgId: string,
    @Param('appId') appId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'app', appId, request);
  }

  @Put(':orgId/apps/:appId')
  putApp(
    @Param('orgId') orgId: string,
    @Param('appId') appId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'app', appId, request);
  }

  @Patch(':orgId/apps/:appId')
  patchApp(
    @Param('orgId') orgId: string,
    @Param('appId') appId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'app', appId, request);
  }

  @Delete(':orgId/apps/:appId')
  deleteApp(
    @Param('orgId') orgId: string,
    @Param('appId') appId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'app', appId, request);
  }

  @Post(':orgId/accounts/:accountId')
  postAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'account', accountId, request);
  }

  @Get(':orgId/accounts/:accountId')
  getAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'account', accountId, request);
  }

  @Put(':orgId/accounts/:accountId')
  putAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'account', accountId, request);
  }

  @Patch(':orgId/accounts/:accountId')
  patchAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'account', accountId, request);
  }

  @Delete(':orgId/accounts/:accountId')
  deleteAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @WebhookRequest() request: WebhookRequestData,
  ): Promise<Response> {
    return this.handle(orgId, 'account', accountId, request);
  }

  private async handle(
    orgId: string,
    target: 'app' | 'account',
    targetId: string,
    request: WebhookRequestData,
  ): Promise<Response> {
    const result = await appsResponse(() =>
      this.webhooks.execute({ orgId, target, targetId, ...request }),
    );
    if (result instanceof Response) {
      return result;
    }
    void result.deferred.catch(() => undefined);
    return new Response(result.response.body ?? '', {
      status: result.response.status,
      headers: {
        'Content-Type': result.response.contentType ?? 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}
