import type { ConnectorCapability } from '@harnesys/contracts';
import {
  CalendarIcon,
  CircleDotIcon,
  FolderGit2Icon,
  HardDriveIcon,
  MailIcon,
  WorkflowIcon,
} from 'lucide-react';

const CAPABILITY_META: Record<ConnectorCapability, { label: string; Icon: typeof CalendarIcon }> = {
  drive: { label: 'Drive', Icon: HardDriveIcon },
  calendar: { label: 'Calendar', Icon: CalendarIcon },
  gmail: { label: 'Gmail', Icon: MailIcon },
  repos: { label: 'Repos', Icon: FolderGit2Icon },
  issues: { label: 'Issues', Icon: CircleDotIcon },
  ci: { label: 'CI', Icon: WorkflowIcon },
};

export function CapabilityChip({ capability }: { capability: ConnectorCapability }) {
  const { label, Icon } = CAPABILITY_META[capability];
  return (
    <span
      className="flex items-center gap-1 rounded bg-muted px-1.5 font-mono text-[10px] text-muted-foreground uppercase leading-4 tracking-wide"
      title={`${label} connected`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function CapabilityChips({
  capabilities,
}: {
  capabilities: readonly ConnectorCapability[];
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {capabilities.map((capability) => (
        <CapabilityChip key={capability} capability={capability} />
      ))}
    </span>
  );
}
