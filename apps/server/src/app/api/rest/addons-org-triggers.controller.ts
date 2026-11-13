import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@harnesys/brix';
import type { TriggerInstanceView } from '@harnesys/contracts';
import type { JsonObject } from '@harnesys/sdk';
import { z } from 'zod';
import { ManageTriggerInstanceUseCase } from '../../application/addons/triggers/manage-instance.use-case.ts';
import { TriggerTargetSchema } from '../../application/addons/triggers/trigger-target.schema.ts';
import { principalUserId } from '../../application/threads/run-attribution.ts';
import { AddonException } from '../../domain/addons/errors.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import type { TriggerInstancePatch } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { AddonOrgAdminGuard } from '../guards/addon-org-admin.guard.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

const UpsertBodySchema = z.object({
  triggerId: z.string().min(1),
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  instructions: z.string().default(''),
  target: TriggerTargetSchema.optional(),
  enabled: z.boolean().default(true),
});
const PatchBodySchema = z.object({
  label: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  instructions: z.string().optional(),
  target: TriggerTargetSchema.optional(),
  enabled: z.boolean().optional(),
});

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons/:addonId/triggers')
export class AddonsOrgTriggersController {
  constructor(
    private readonly manage: ManageTriggerInstanceUseCase,
    private readonly instances: TriggerInstanceRepositoryPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
  ): { items: TriggerInstanceView[] } {
    return { items: this.instances.list(orgId, addonId).map((row) => this.viewOf(row)) };
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post()
  create(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @SessionPrincipal() principal: Principal,
    @Body(UpsertBodySchema) body: z.infer<typeof UpsertBodySchema>,
  ): TriggerInstanceView {
    const created = this.manage.create({
      orgId,
      addonId,
      triggerId: body.triggerId,
      label: body.label,
      config: body.config as JsonObject,
      instructions: body.instructions,
      ...(body.target === undefined ? {} : { target: body.target }),
      enabled: body.enabled,
      actor: { kind: 'user', id: principalUserId(principal) ?? 'admin' },
      actorUserId: principalUserId(principal),
    });
    return this.viewOf(created);
  }

  @UseGuards(AddonOrgAdminGuard)
  @Patch(':tid')
  patch(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Param('tid') tid: string,
    @Body(PatchBodySchema) body: z.infer<typeof PatchBodySchema>,
  ): TriggerInstanceView {
    this.assertRow(orgId, addonId);
    const patch: TriggerInstancePatch = {};
    if (body.label !== undefined) {
      patch.label = body.label;
    }
    if (body.config !== undefined) {
      patch.configJson = JSON.stringify(body.config);
    }
    if (body.instructions !== undefined) {
      patch.instructions = body.instructions;
    }
    if (body.target !== undefined) {
      patch.targetJson = JSON.stringify(body.target);
    }
    if (body.enabled !== undefined) {
      patch.enabled = body.enabled;
    }
    this.manage.patch(orgId, tid, patch);
    const row = this.instances.find(orgId, tid);
    if (!row) {
      throw new AddonException('not_found', 404, `Trigger instance not found: ${tid}`);
    }
    return this.viewOf(row);
  }

  @UseGuards(AddonOrgAdminGuard)
  @Delete(':tid')
  async delete(@Param('orgId') orgId: string, @Param('tid') tid: string): Promise<void> {
    await this.manage.delete({ orgId, instanceId: tid });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':tid/enable')
  async enable(@Param('orgId') orgId: string, @Param('tid') tid: string): Promise<void> {
    await this.manage.enable({ orgId, instanceId: tid });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':tid/disable')
  async disable(@Param('orgId') orgId: string, @Param('tid') tid: string): Promise<void> {
    await this.manage.disable({ orgId, instanceId: tid });
  }

  private assertRow(orgId: string, addonId: string): void {
    if (!this.orgAddons.find(orgId, addonId)) {
      throw new AddonException('not_found', 404, `Addon is not installed here: ${addonId}`);
    }
  }

  private viewOf(row: {
    id: string;
    orgId: string;
    addonId: string;
    triggerId: string;
    label: string;
    configJson: string;
    instructions: string;
    targetJson: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }): TriggerInstanceView {
    return {
      instanceId: row.id,
      addonId: row.addonId,
      triggerId: row.triggerId,
      label: row.label,
      config: this.jsonOf(row.configJson),
      instructions: row.instructions,
      target: JSON.parse(row.targetJson) as unknown,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private jsonOf(json: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(json);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed rows surface as empty config.
    }
    return {};
  }
}
