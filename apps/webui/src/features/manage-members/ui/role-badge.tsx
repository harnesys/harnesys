import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { type MemberRole, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../model/member-access';

const ROLE_BADGE_CLASS: Record<MemberRole, string> = {
  owner: 'border-primary/30 bg-primary/10 text-primary',
  admin: 'border-status-info/30 bg-status-info/10 text-status-info',
  operator: 'border-border bg-muted/50 text-foreground',
  viewer: 'border-border bg-transparent text-muted-foreground',
  custom: 'border-status-warn/30 bg-status-warn/10 text-status-warn',
};

export function RoleBadge({ role, className }: { role: MemberRole; className?: string }) {
  return (
    <Badge
      variant="outline"
      title={ROLE_DESCRIPTIONS[role]}
      className={cn('font-medium', ROLE_BADGE_CLASS[role], className)}
    >
      {ROLE_LABELS[role]}
    </Badge>
  );
}
