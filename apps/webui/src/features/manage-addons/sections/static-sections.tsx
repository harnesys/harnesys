import { RowSection } from '@/shared/ui/capability-rows';
import { Markdown } from '@/shared/ui/markdown';
import { AddonFrameBridge } from '../frame-bridge';
import { resolveL10nText } from '../lib/route-call';
import type { SectionProps } from '../lib/section-props';
import type { SectionL10n } from '../lib/view-sections';

export function MarkdownSection({ section }: SectionProps) {
  const body = isL10n(section.body) ? section.body : '';
  return (
    <RowSection label="Notes">
      <Markdown text={resolveL10nText(body)} className="text-[13px] opacity-80" />
    </RowSection>
  );
}

export function FrameSection({ orgId, addonId, section }: SectionProps) {
  const route = typeof section.route === 'string' ? section.route : '/';
  const height = typeof section.height === 'number' ? section.height : undefined;
  return <AddonFrameBridge orgId={orgId} addonId={addonId} route={route} height={height} />;
}

function isL10n(value: unknown): value is SectionL10n {
  return typeof value === 'string' || (typeof value === 'object' && value !== null);
}
