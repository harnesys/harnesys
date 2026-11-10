import type { OrgAddonHealth } from '@harnesys/contracts';
import { Badge } from '@/shared/ui/badge';
import { RowField, RowSection } from '@/shared/ui/capability-rows';

import type { SectionProps } from '../lib/section-props';

export function StatusSection({ detail }: SectionProps) {
  return (
    <RowSection label="Status">
      <RowField label="Pinned version" value={detail.version} />
      <RowField
        label="State"
        value={
          <span className="flex items-center gap-1.5">
            <Badge variant={detail.enabled ? 'default' : 'outline'}>
              {detail.enabled ? 'enabled' : 'disabled'}
            </Badge>
            <Badge variant={healthVariant(detail.health)}>{detail.health}</Badge>
          </span>
        }
      />
      <RowField label="Runtime profile" value={detail.manifest.runtimeProfile} />
      <RowField label="Activation" value={detail.manifest.activation} />
      {detail.updateAvailable ? (
        <RowField label="Update available" value={detail.updateAvailable} />
      ) : null}
      {detail.lastError ? <RowField label="Last error" value={detail.lastError} /> : null}
      {detail.compatibility.reasons.length > 0 ? (
        <RowField label="Compatibility" value={detail.compatibility.reasons.join('; ')} />
      ) : null}
    </RowSection>
  );
}

function healthVariant(health: OrgAddonHealth): 'secondary' | 'destructive' | 'outline' {
  if (health === 'quarantined' || health === 'failed') {
    return 'destructive';
  }
  return health === 'running' ? 'secondary' : 'outline';
}
