import { RowField, RowSection } from '@/shared/ui/capability-rows';
import type { SectionProps } from '../lib/section-props';

/**
 * Operational facts for an installed add-on. Identity, the pinned version and
 * the last error live on the page hero, so they are not repeated here.
 */
export function StatusSection({ detail }: SectionProps) {
  const compatibility = detail.compatibility.reasons;
  const skipped = detail.compatibility.skipped.length;
  const hasFacts = detail.updateAvailable !== null || compatibility.length > 0 || skipped > 0;
  if (!hasFacts) {
    return null;
  }
  return (
    <RowSection label="Runtime">
      {detail.updateAvailable ? (
        <RowField label="Update available" value={detail.updateAvailable} />
      ) : null}
      {compatibility.length > 0 ? (
        <RowField label="Compatibility" value={compatibility.join('; ')} />
      ) : null}
      {skipped > 0 ? <RowField label="Skipped capabilities" value={String(skipped)} /> : null}
    </RowSection>
  );
}
