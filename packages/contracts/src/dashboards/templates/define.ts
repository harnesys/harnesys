import type { WidgetDoc, WidgetRect } from '../doc.ts';

export interface WidgetTemplate {
  id: string;
  title: string;
  description: string;
  rect: WidgetRect;
  doc: WidgetDoc;
}

/** Identity helper that keeps the literal `id` and the doc type. */
export function defineWidgetTemplate<const T extends WidgetTemplate>(template: T): T {
  return template;
}
