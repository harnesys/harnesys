import type { OrgAddonDetail } from '@harnesys/contracts';

export interface SectionProps {
  orgId: string;
  addonId: string;
  detail: OrgAddonDetail;
  /** False while the organization has no row for the add-on: mutations are unavailable. */
  installed: boolean;
  /** Raw descriptor section record from the view contribution. */
  section: Record<string, unknown>;
  onRefresh: () => void;
}
