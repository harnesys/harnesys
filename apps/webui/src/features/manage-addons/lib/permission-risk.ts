import type { AddonPermissionRisk } from '@harnesys/contracts';

export const PERMISSION_RISK_TONE: Record<AddonPermissionRisk, 'danger' | 'warn' | 'neutral'> = {
  high: 'danger',
  medium: 'warn',
  low: 'neutral',
};
