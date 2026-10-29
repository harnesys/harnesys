import {
  Body,
  Controller,
  Ctx,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Public,
} from '@harnesys/brix';
import type {
  CreateWebhookBody,
  CreateWebhookResponse,
  FireWebhookResponse,
  ListWebhooksResponse,
  UpdateWebhookBody,
  WebhookPublic,
} from '@harnesys/contracts';
import {
  CreateWebhookBodySchema,
  FireWebhookBodySchema,
  UpdateWebhookBodySchema,
} from '@harnesys/contracts';
import type { Context } from 'hono';
import { principalUserId } from '../../application/threads/run-attribution.ts';
import { CreateWebhookUseCase } from '../../application/webhooks/create-webhook.use-case.ts';
import { DeleteWebhookUseCase } from '../../application/webhooks/delete-webhook.use-case.ts';
import { FireWebhookUseCase } from '../../application/webhooks/fire-webhook.use-case.ts';
import { ListWebhooksUseCase } from '../../application/webhooks/list-webhooks.use-case.ts';
import { UpdateWebhookUseCase } from '../../application/webhooks/update-webhook.use-case.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('orgs/:orgId/webhooks')
export class WebhooksController {
  constructor(
    private readonly listWebhooks: ListWebhooksUseCase,
    private readonly createWebhook: CreateWebhookUseCase,
    private readonly updateWebhook: UpdateWebhookUseCase,
    private readonly deleteWebhook: DeleteWebhookUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListWebhooksResponse {
    return this.listWebhooks.execute({ orgId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @SessionPrincipal() principal: Principal,
    @Body(CreateWebhookBodySchema) body: CreateWebhookBody,
  ): CreateWebhookResponse {
    return this.createWebhook.execute({ orgId, actorUserId: principalUserId(principal), body });
  }

  @Patch(':webhookId')
  update(
    @Param('orgId') orgId: string,
    @Param('webhookId') webhookId: string,
    @SessionPrincipal() principal: Principal,
    @Body(UpdateWebhookBodySchema) body: UpdateWebhookBody,
  ): WebhookPublic {
    return this.updateWebhook.execute({
      orgId,
      webhookId,
      actorUserId: principalUserId(principal),
      body,
    });
  }

  @Delete(':webhookId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('webhookId') webhookId: string): void {
    this.deleteWebhook.execute({ orgId, webhookId });
  }
}

@Controller('orgs/:orgId/hooks')
export class OrgHooksController {
  constructor(private readonly fireWebhook: FireWebhookUseCase) {}

  @Public()
  @Post(':id')
  @HttpCode(202)
  async fire(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Ctx() ctx: Context,
  ): Promise<FireWebhookResponse> {
    const raw = await ctx.req.json().catch(() => ({}));
    const body = FireWebhookBodySchema.parse(raw ?? {});
    return this.fireWebhook.execute({
      orgId,
      webhookId: id,
      text: body.text,
    });
  }
}
