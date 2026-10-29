import { cn } from '@/shared/lib/utils';
import type { Agent } from '../model/agent';
import { agentColorTintClass } from '../model/agent-colors';

const AVATAR_SIZES = {
  sm: 'size-4 text-[8px] leading-none',
  md: 'size-9 text-xs',
  lg: 'size-10 text-sm',
} as const;

export type AgentAvatarSize = keyof typeof AVATAR_SIZES;

interface AgentAvatarProps {
  initials: string;
  color: string | null;
  title?: string;
  size?: AgentAvatarSize;
  className?: string;
}

export function AgentAvatar({ initials, color, title, size = 'sm', className }: AgentAvatarProps) {
  return (
    <span
      title={title}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium',
        AVATAR_SIZES[size],
        agentColorTintClass(color),
        className,
      )}
    >
      {initials.slice(0, 2)}
    </span>
  );
}

export function AgentRecordAvatar({
  agent,
  title,
  size,
  className,
}: {
  agent: Agent;
  title?: string;
  size?: AgentAvatarSize;
  className?: string;
}) {
  return (
    <AgentAvatar
      initials={agent.initials}
      color={agent.color}
      title={title}
      size={size}
      className={className}
    />
  );
}
