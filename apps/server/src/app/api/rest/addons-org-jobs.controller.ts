import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@harnesys/brix';
import type { AddonJobScheduleView, AddonJobView } from '@harnesys/contracts';
import { JobDescriptorSchema } from '@harnesys/sdk';
import { z } from 'zod';
import { RunJobUseCase } from '../../application/addons/jobs/run-job.use-case.ts';
import { AddonJobScheduler } from '../../application/addons/jobs/schedule-jobs.service.ts';
import { AddonException } from '../../domain/addons/errors.ts';
import { ContributionRegistryPort } from '../../domain/addons/ports/contribution-registry.port.ts';
import { JobStateRepositoryPort } from '../../domain/addons/ports/job-state-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import { AddonOrgAdminGuard } from '../guards/addon-org-admin.guard.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

const PatchBodySchema = z.object({ enabled: z.boolean() });

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons/:addonId/jobs')
export class AddonsOrgJobsController {
  constructor(
    private readonly runJob: RunJobUseCase,
    private readonly scheduler: AddonJobScheduler,
    private readonly jobs: JobStateRepositoryPort,
    private readonly registry: ContributionRegistryPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
  ): { items: AddonJobView[] } {
    this.assertRow(orgId, addonId);
    const descriptors = this.descriptorsOf(orgId, addonId);
    const items = this.jobs.list(orgId, addonId).flatMap((row) => {
      const descriptor = descriptors.get(row.jobId);
      if (!descriptor) {
        return [];
      }
      return [
        {
          addonId: row.addonId,
          jobId: row.jobId,
          title:
            typeof descriptor.title === 'string'
              ? descriptor.title
              : (descriptor.title.en ?? row.jobId),
          schedule: descriptor.schedule as AddonJobScheduleView,
          ...(descriptor.timezone === undefined ? {} : { timezone: descriptor.timezone }),
          enabled: row.enabled,
          nextRunAt: row.nextRunAt,
          lastRunAt: row.lastRunAt,
          lastStatus: row.lastStatus,
        } satisfies AddonJobView,
      ];
    });
    return { items };
  }

  @UseGuards(AddonOrgAdminGuard)
  @Patch(':jobId')
  patch(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Param('jobId') jobId: string,
    @Body(PatchBodySchema) body: z.infer<typeof PatchBodySchema>,
  ): void {
    this.assertRow(orgId, addonId);
    this.scheduler.patch(orgId, addonId, jobId, body.enabled);
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':jobId/run')
  async run(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Param('jobId') jobId: string,
  ): Promise<{ status: string | null }> {
    this.assertRow(orgId, addonId);
    return await this.runJob.execute({ orgId, addonId, jobId });
  }

  private descriptorsOf(
    orgId: string,
    addonId: string,
  ): Map<string, z.infer<typeof JobDescriptorSchema>> {
    const descriptors = new Map<string, z.infer<typeof JobDescriptorSchema>>();
    for (const record of this.registry.contributions(orgId, 'job')) {
      if (record.owner.addonId !== addonId) {
        continue;
      }
      const parsed = JobDescriptorSchema.safeParse(record.descriptor);
      if (parsed.success) {
        descriptors.set(parsed.data.id, parsed.data);
      }
    }
    return descriptors;
  }

  private assertRow(orgId: string, addonId: string): void {
    if (!this.orgAddons.find(orgId, addonId)) {
      throw new AddonException('not_found', 404, `Addon is not installed here: ${addonId}`);
    }
  }
}
