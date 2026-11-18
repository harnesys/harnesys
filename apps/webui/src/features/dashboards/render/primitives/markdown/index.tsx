import type { LucideIcon } from 'lucide-react';
import { TextIcon as MarkdownLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Markdown } from '@/shared/ui/markdown';
import { asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const MarkdownIcon: LucideIcon = MarkdownLucideIcon;

/** Markdown text rendered with the shared renderer (already present in webui). */
export function MarkdownPrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const text = asText(props.text) ?? '';
  if (text.trim() === '') {
    return <WidgetEmptyState message="No content" />;
  }
  return (
    <div className="h-full min-h-0 w-full overflow-auto">
      <Markdown text={text} className="text-sm" />
    </div>
  );
}
