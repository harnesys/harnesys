import { CloudIcon, GitBranchIcon, HardDriveIcon, StarIcon } from 'lucide-react';
import type { SourceDistributionKind } from '@/shared/api/sources';
import { cn } from '@/shared/lib/utils';
import { FolderTypeIcon } from '@/shared/ui/icons';

function DistributionBadge({
  hasGit,
  hasRemote,
  kind,
  managed,
  isLocal,
}: {
  hasGit: boolean;
  hasRemote: boolean;
  kind?: SourceDistributionKind;
  managed: boolean;
  isLocal: boolean;
}) {
  if (kind === 'cloud-drive') {
    return <BadgeIcon icon={CloudIcon} color="text-sky-500/75" />;
  }
  if (hasGit) {
    return (
      <BadgeIcon
        icon={GitBranchIcon}
        color={hasRemote ? 'text-amber-500/75' : 'text-muted-foreground/60'}
      />
    );
  }
  if (managed) {
    return <BadgeIcon icon={StarIcon} color="text-violet-500/75" />;
  }
  return (
    <BadgeIcon icon={HardDriveIcon} color={isLocal ? 'text-emerald-500/75' : 'text-blue-500/75'} />
  );
}

function BadgeIcon({ icon: Icon, color }: { icon: typeof CloudIcon; color: string }) {
  return (
    <span className="absolute -right-1 -bottom-1 flex size-3 items-center justify-center rounded-full bg-sidebar ring-1 ring-border/50">
      <Icon className={cn('size-2', color)} aria-hidden />
    </span>
  );
}

export function SourceRootIcon({
  driver,
  hasGit = false,
  hasRemote = false,
  managed = false,
  isLocal = false,
  open,
  className,
}: {
  driver?: SourceDistributionKind;
  hasGit?: boolean;
  hasRemote?: boolean;
  managed?: boolean;
  isLocal?: boolean;
  open: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex size-[18px] shrink-0', className)} aria-hidden>
      <FolderTypeIcon open={open} size="sm" />
      <DistributionBadge
        hasGit={hasGit}
        hasRemote={hasRemote}
        kind={driver}
        managed={managed}
        isLocal={isLocal}
      />
    </span>
  );
}
