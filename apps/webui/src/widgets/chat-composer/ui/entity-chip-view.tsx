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
  XIcon,
  ZapIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatBytes } from '@/shared/lib/file-meta';
import { FileTypeIcon } from '@/shared/ui/icons';
import { type EntityKind, isEntityKind, isValidEntityRef } from '../model/entity-kinds';
import { getPendingFile } from '../model/pending-files';

export function EntityChipView(props: NodeViewProps) {
  const kind = props.node.attrs.kind;
  const { ref } = props.node.attrs;
  const href = props.node.attrs.href as string;
  const token = props.node.attrs.token as string;
  if (!isEntityKind(kind) || !isValidEntityRef(kind, ref)) {
    return null;
  }
  if (kind === 'file' && token) {
    return <UploadFileChip props={props} token={token} name={ref} />;
  }
  const title = entityChipTitle(kind, ref, href);
  const label = entityChipLabel(kind, ref);
  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex h-6 max-w-60 items-center gap-1.5 rounded-md bg-muted/70 px-1.5 align-middle font-medium text-[11px] leading-none"
      title={title}
    >
      <EntityChipIcon kind={kind} ref={ref} />
      <span className="truncate">{label}</span>
    </NodeViewWrapper>
  );
}

function UploadFileChip({
  props,
  token,
  name,
}: {
  props: NodeViewProps;
  token: string;
  name: string;
}) {
  const file = getPendingFile(token);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    const pending = getPendingFile(token);
    if (!pending?.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [token]);
  const title = file && file.size > 0 ? `${name} · ${formatBytes(file.size)}` : name;
  function remove() {
    const pos = props.getPos();
    if (pos === undefined) {
      return;
    }
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + props.node.nodeSize })
      .run();
  }
  return (
    <NodeViewWrapper
      as="span"
      className="group inline-flex h-6 max-w-60 items-center gap-1.5 rounded-md bg-muted/70 px-1.5 align-middle font-medium text-[11px] leading-none"
      title={title}
    >
      {preview ? (
        <img src={preview} alt="" className="size-4 shrink-0 rounded-sm object-cover" />
      ) : (
        <EntityChipIcon kind="file" ref={name} />
      )}
      <span className="truncate">{name}</span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={remove}
        className="shrink-0 rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <XIcon className="size-3" />
      </button>
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
