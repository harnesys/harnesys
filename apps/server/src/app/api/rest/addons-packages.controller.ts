import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@harnesys/brix';
import type { AddonPackageView, AddonPolicyView, InstallPlan } from '@harnesys/contracts';
import { resolveL10n } from '@harnesys/sdk';
import { z } from 'zod';
import { ConfirmInstallUseCase } from '../../application/addons/packages/confirm-install.use-case.ts';
import { PlanInstallUseCase } from '../../application/addons/packages/plan-install.use-case.ts';
import { PrunePackagesUseCase } from '../../application/addons/packages/prune.use-case.ts';
import { RemovePackageUseCase } from '../../application/addons/packages/remove-package.use-case.ts';
import type { AddonHostPolicy } from '../../domain/addons/permissions.ts';
import type { InstalledAddonPackage } from '../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonPackageCatalogPort } from '../../domain/addons/ports/addon-package-catalog.port.ts';
import { GrantPolicyPort } from '../../domain/addons/ports/grant-policy.port.ts';
import { AddonHostAdminGuard } from '../guards/addon-host-admin.guard.ts';
import { manifestSummaryOf } from './addons-org-views.ts';

const PlanBodySchema = z.object({ source: z.string().min(1) });
const PolicyBodySchema = z.object({
  forbiddenPermissions: z.array(z.string()).optional(),
  forbiddenHosts: z.array(z.string()).optional(),
  allowedSources: z.array(z.string()).optional(),
  allowUnsandboxedExternal: z.boolean().optional(),
});

@UseGuards(AddonHostAdminGuard)
@Controller('api/addons')
export class AddonsPackagesController {
  constructor(
    private readonly planInstall: PlanInstallUseCase,
    private readonly confirmInstall: ConfirmInstallUseCase,
    private readonly removePackage: RemovePackageUseCase,
    private readonly prunePackages: PrunePackagesUseCase,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly policy: GrantPolicyPort,
  ) {}

  @Get('packages')
  list(): AddonPackageView[] {
    return this.catalog.listInstalled().map((pkg) => this.viewOf(pkg));
  }

  @Post('packages/plan')
  async plan(@Body(PlanBodySchema) body: z.infer<typeof PlanBodySchema>): Promise<InstallPlan> {
    return await this.planInstall.execute({
      source: body.source,
      actor: { kind: 'user', id: 'host-admin' },
    });
  }

  @Post('packages/plan/:planId/confirm')
  async confirm(@Param('planId') planId: string): Promise<InstallPlan> {
    return await this.confirmInstall.execute({ planId, actor: { kind: 'user', id: 'host-admin' } });
  }

  @Delete('packages/:id/:version')
  remove(@Param('id') id: string, @Param('version') version: string): void {
    this.removePackage.execute({ id, version, actor: { kind: 'user', id: 'host-admin' } });
  }

  @Post('packages/prune')
  prune(): ReturnType<PrunePackagesUseCase['execute']> {
    return this.prunePackages.execute({ kind: 'user', id: 'host-admin' });
  }

  @Get('policy')
  readPolicy(): AddonPolicyView {
    return this.normalize(this.policy.read());
  }

  @Put('policy')
  writePolicy(@Body(PolicyBodySchema) body: z.infer<typeof PolicyBodySchema>): AddonPolicyView {
    const next: AddonHostPolicy = {
      forbiddenPermissions:
        body.forbiddenPermissions === undefined ? undefined : [...body.forbiddenPermissions],
      forbiddenHosts: body.forbiddenHosts === undefined ? undefined : [...body.forbiddenHosts],
      allowedSources: body.allowedSources === undefined ? undefined : [...body.allowedSources],
      allowUnsandboxedExternal: body.allowUnsandboxedExternal,
    };
    this.policy.write(next);
    return this.normalize(this.policy.read());
  }

  private normalize(policy: AddonHostPolicy): AddonPolicyView {
    return {
      forbiddenPermissions: [...(policy.forbiddenPermissions ?? [])],
      forbiddenHosts: [...(policy.forbiddenHosts ?? [])],
      allowedSources: [...(policy.allowedSources ?? [])],
      allowUnsandboxedExternal: policy.allowUnsandboxedExternal ?? false,
    };
  }

  private viewOf(pkg: InstalledAddonPackage): AddonPackageView {
    return {
      id: pkg.id,
      version: pkg.version,
      digest: pkg.digest,
      source: pkg.source,
      trust: pkg.trust,
      title: resolveL10n(pkg.manifest.title, { locale: 'en' }),
      description: resolveL10n(pkg.manifest.description, { locale: 'en' }),
      ...(pkg.manifest.icon === undefined ? {} : { icon: pkg.manifest.icon }),
      manifest: manifestSummaryOf(pkg),
      warnings: [],
    };
  }
}
