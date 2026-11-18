import type { WidgetDoc, WidgetRect } from '@harnesys/contracts';
import { materializeWidgetTemplate, WIDGET_TEMPLATES } from '@harnesys/contracts';

export type { WidgetTemplate } from '@harnesys/contracts';
export { WIDGET_TEMPLATES };

export interface WidgetTemplateSummary {
  id: string;
  title: string;
  description: string;
  rect: WidgetRect;
  itemCount: number;
  sourceCount: number;
}

export function widgetTemplateById(id: string) {
  return WIDGET_TEMPLATES.find((template) => template.id === id);
}

export function materializeTemplate(template: (typeof WIDGET_TEMPLATES)[number], orgId: string) {
  return materializeWidgetTemplate(template, orgId) as WidgetDoc;
}

export function widgetTemplateSummaries(): WidgetTemplateSummary[] {
  return WIDGET_TEMPLATES.map((template) => ({
    id: template.id,
    title: template.title,
    description: template.description,
    rect: template.rect,
    itemCount: template.doc.items.length,
    sourceCount: template.doc.sources.length,
  }));
}
