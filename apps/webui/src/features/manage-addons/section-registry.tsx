import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import type { SectionProps } from './lib/section-props';
import type { SectionEntry } from './lib/view-sections';
import { ActionsSection } from './sections/actions-section';
import { AutomationsSection } from './sections/automations-section';
import { ConfigSection } from './sections/config-section';
import { ConnectionsSection } from './sections/connections-section';
import { FormSection } from './sections/form-section';
import { JobsSection } from './sections/jobs-section';
import { PermissionsSection } from './sections/permissions-section';
import { FrameSection, MarkdownSection } from './sections/static-sections';
import { StatusSection } from './sections/status-section';
import { TableSection } from './sections/table-section';

type SectionComponent = (props: SectionProps) => React.ReactNode;

const REGISTRY: Record<string, SectionComponent> = {
  status: StatusSection,
  permissions: PermissionsSection,
  config: ConfigSection,
  connections: ConnectionsSection,
  automations: AutomationsSection,
  jobs: JobsSection,
  table: TableSection,
  form: FormSection,
  actions: ActionsSection,
  markdown: MarkdownSection,
  frame: FrameSection,
};

export function renderSection(
  entry: SectionEntry,
  props: Omit<SectionProps, 'section'>,
): React.ReactNode {
  if (entry.kind === 'unknown') {
    return <UnknownSectionNote sectionType={entry.sectionType} />;
  }
  const component = REGISTRY[entry.section.type];
  if (!component) {
    return <UnknownSectionNote sectionType={entry.section.type} />;
  }
  return component({ ...props, section: entry.section as Record<string, unknown> });
}

export function isKnownSection(sectionType: string): boolean {
  return sectionType in REGISTRY;
}

export type { SectionProps };

function UnknownSectionNote({ sectionType }: { sectionType: string }) {
  return (
    <RowSection label={`Section "${sectionType}"`}>
      <RowItem
        title="Requires a newer app version"
        description="This section type is not supported by the current interface."
        testId={`addon-section-unknown-${sectionType}`}
      />
    </RowSection>
  );
}
