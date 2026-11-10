import type { OrgAddonDetail } from '@harnesys/contracts';

export interface SectionProps {
  orgId: string;
  addonId: string;
  detail: OrgAddonDetail;
  /** Raw descriptor section record from the view contribution. */
  section: Record<string, unknown>;
  onRefresh: () => void;
}
