export interface DelegatedAskOrigin {
  agentId?: string;
  agentType?: string;
  spawnPath?: string;
}

export function DelegateBadge({ delegated }: { delegated: DelegatedAskOrigin | undefined }) {
  if (!delegated) {
    return null;
  }
  const name = delegated.agentType ?? delegated.agentId;
  return (
    <p className="text-[11px] text-muted-foreground" data-testid="delegate-badge">
      Delegate{name ? ` ${name}` : ''}
    </p>
  );
}
