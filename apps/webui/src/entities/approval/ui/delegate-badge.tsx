export interface DelegatedAskOrigin {
  agentId?: string;
  agentType?: string;
  spawnPath?: string;
}

export function DelegateBadge({ delegated }: { delegated: DelegatedAskOrigin | undefined }) {
  if (!delegated) {
    return null;
  }
  const parts = [delegated.agentType, delegated.spawnPath].filter(
    (part): part is string => part !== undefined,
  );
  return (
    <p className="text-[11px] text-muted-foreground" data-testid="delegate-badge">
      Delegate{parts.length > 0 ? ` ${parts.join(' · ')}` : ''}
    </p>
  );
}
