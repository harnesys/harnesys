import { Controller, Get, Param, UseGuards } from '@harnesys/brix';
import { resolveL10n } from '@harnesys/sdk';
import { AddonViewerTablePort } from '../../domain/addons/ports/viewer-table.port.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

export interface AddonViewerView {
  addonId: string;
  id: string;
  title: string;
  extensions: string[];
  route: string;
  mode: 'view' | 'edit';
  create: boolean;
}

export interface AddonViewerListResponse {
  viewers: AddonViewerView[];
}

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addon-viewers')
export class AddonViewersController {
  constructor(private readonly viewers: AddonViewerTablePort) {}

  @Get()
  list(@Param('orgId') orgId: string): AddonViewerListResponse {
    return {
      viewers: this.viewers.list(orgId).map((entry) => ({
        addonId: entry.addonId,
        id: entry.viewerId,
        title: resolveL10n(entry.title, { locale: 'en' }),
        extensions: [...entry.extensions],
        route: entry.route,
        mode: entry.mode,
        create: entry.create,
      })),
    };
  }
}
