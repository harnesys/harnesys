import type { L10n } from '@harnesys/sdk';

export type AddonViewerMode = 'view' | 'edit';

export interface AddonViewerEntryView {
  addonId: string;
  viewerId: string;
  title: L10n;
  extensions: readonly string[];
  route: string;
  mode: AddonViewerMode;
  create: boolean;
}

export abstract class AddonViewerTablePort {
  abstract list(orgId: string): AddonViewerEntryView[];
}
