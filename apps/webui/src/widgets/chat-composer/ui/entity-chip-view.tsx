import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import {
  AtSignIcon,
  CalendarClockIcon,
  HardDriveIcon,
  type LucideIcon,
  SquareKanbanIcon,
  SquareTerminalIcon,
  WebhookIcon,
  ZapIcon,
} from 'lucide-react';
import { FileTypeIcon } from '@/shared/ui/icons';
import { type EntityKind, isEntityKind, isValidEntityRef } from '../model/entity-kinds';

export function EntityChipView(props: NodeViewProps) {
  const kind = props.node.attrs.kind;
  const { ref } = props.node.attrs;
  const href = props.node.attrs.href as string;
  if (!isEntityKind(kind) || !isValidEntityRef(kind, ref)) {
    return null;
  }
  const title = entityChipTitle(kind, ref, href);
  const label = entityChipLabel(kind, ref);
  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex h-5 max-w-60 items-center gap-1 rounded-md border border-border bg-secondary px-1.5 align-middle font-medium text-[11px] leading-none"
      title={title}
    >
      <EntityChipIcon kind={kind} ref={ref} />
      <span className="truncate">{label}</span>
    </NodeViewWrapper>
  );
}

function entityChipTitle(kind: EntityKind, ref: string, href: string): string {
  if (kind === 'mention') {
    return `@${ref}`;
  }
  if (href && kind !== 'skill') {
    return `${ref} → ${href}`;
  }
  return ref;
}

function entityChipLabel(kind: EntityKind, ref: string): string {
  return kind === 'mention' ? `@${ref}` : ref;
}

function EntityChipIcon({ kind, ref }: { kind: EntityKind; ref: string }) {
  if (kind === 'file') {
    return <FileTypeIcon name={ref} size="xs" />;
  }
  const Icon = ENTITY_ICONS[kind];
  return <Icon className="size-3 shrink-0 text-muted-foreground" />;
}

const ENTITY_ICONS: Record<Exclude<EntityKind, 'file'>, LucideIcon> = {
  skill: ZapIcon,
  terminal: SquareTerminalIcon,
  source: HardDriveIcon,
  board: SquareKanbanIcon,
  schedule: CalendarClockIcon,
  webhook: WebhookIcon,
  mention: AtSignIcon,
};
