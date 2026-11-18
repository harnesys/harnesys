import type { LucideIcon } from 'lucide-react';
import { LayoutDashboardIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const CustomIcon: LucideIcon = LayoutDashboardIcon;

/**
 * Placeholder for a `custom` item outside the transform path. A doc with a
 * transform renders through WidgetNodeRenderer instead.
 */
export function CustomPrimitive(_props: PrimitiveComponentProps): ReactNode {
  return <WidgetEmptyState message="Custom widgets require a transform" />;
}
