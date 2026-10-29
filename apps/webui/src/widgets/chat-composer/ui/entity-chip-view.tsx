import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ZapIcon } from 'lucide-react';
import { FileTypeIcon } from '@/shared/ui/icons';
import type { EntityKind } from '../model/entity-kinds';
import { isValidEntityRef } from '../model/entity-kinds';
export function EntityChipView(props: NodeViewProps) {
  const kind = props.node.attrs.kind as EntityKind;
  const { ref } = props.node.attrs;
  const href = props.node.attrs.href as string;
  if ((kind !== 'skill' && kind !== 'file') || !isValidEntityRef(kind, ref)) {
    return null;
  }
  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex h-5 max-w-60 items-center gap-1 rounded-md border border-border bg-secondary px-1.5 align-middle font-medium text-[11px] leading-none"
      title={kind === 'file' && href ? `${ref} → ${href}` : ref}
    >
      {kind === 'file' ? (
        <FileTypeIcon name={ref} size="xs" />
      ) : (
        <ZapIcon className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{ref}</span>
    </NodeViewWrapper>
  );
}
