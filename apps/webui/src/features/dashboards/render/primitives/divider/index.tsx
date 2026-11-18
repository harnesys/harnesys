import type { LucideIcon } from 'lucide-react';
import { MinusIcon as DividerLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Separator } from '@/shared/ui/separator';
import type { PrimitiveComponentProps } from '../primitive-props';

export const DividerIcon: LucideIcon = DividerLucideIcon;

/** Horizontal rule with no props and no events. */
export function DividerPrimitive(_props: PrimitiveComponentProps): ReactNode {
  return (
    <div className="flex h-full w-full items-center px-1">
      <Separator />
    </div>
  );
}
