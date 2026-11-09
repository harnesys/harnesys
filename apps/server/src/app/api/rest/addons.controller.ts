import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@harnesys/brix';
import type {
  AddonDetail,
  AddonLogLine,
  AddonSummary,
  SetAddonConfigBody,
} from '@harnesys/contracts';
import { SetAddonConfigBodySchema } from '@harnesys/contracts';
import { z } from 'zod';
import { AddonHostPort } from '../../domain/addons/addon-host.port.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

const LogsQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
});

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons')
export class AddonsController {
  constructor(private readonly addons: AddonHostPort) {}

  @Get()
  list(@Param('orgId') orgId: string): AddonSummary[] {
    return this.addons.list(orgId);
  }

  @Get(':addonId')
  detail(@Param('orgId') orgId: string, @Param('addonId') addonId: string): AddonDetail {
    return this.addons.detail(orgId, addonId);
  }

  @Post(':addonId/enable')
  enable(@Param('orgId') orgId: string, @Param('addonId') addonId: string): Promise<AddonSummary> {
    return this.addons.enable(orgId, addonId);
  }

  @Post(':addonId/disable')
  disable(@Param('orgId') orgId: string, @Param('addonId') addonId: string): Promise<AddonSummary> {
    return this.addons.disable(orgId, addonId);
  }

  @Put(':addonId/config')
  config(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Body(SetAddonConfigBodySchema) body: SetAddonConfigBody,
  ) {
    return this.addons.setConfig(orgId, addonId, body.values);
  }

  @Get(':addonId/logs')
  logs(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Query(LogsQuerySchema) query: z.infer<typeof LogsQuerySchema>,
  ): AddonLogLine[] {
    return this.addons.logsOf(orgId, addonId, query.since);
  }
}
