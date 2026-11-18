import type { WidgetDoc } from '../doc.ts';
import { agentRosterTemplate } from './agent-roster.ts';
import { approvalsQueueTemplate } from './approvals-queue.ts';
import { blankTemplate } from './blank.ts';
import { clickCounterTemplate } from './click-counter.ts';
import type { WidgetTemplate } from './define.ts';
import { kpiThreadsTemplate } from './kpi-threads.ts';
import { notesTemplate } from './notes.ts';
import { spendChartTemplate } from './spend-chart.ts';

export type { WidgetTemplate } from './define.ts';
export { defineWidgetTemplate } from './define.ts';

export const WIDGET_TEMPLATES: readonly WidgetTemplate[] = [
  blankTemplate,
  clickCounterTemplate,
  kpiThreadsTemplate,
  approvalsQueueTemplate,
  agentRosterTemplate,
  spendChartTemplate,
  notesTemplate,
];

export function widgetTemplateById(id: string): WidgetTemplate | undefined {
  return WIDGET_TEMPLATES.find((template) => template.id === id);
}

/** Copies the template doc, substituting `:orgId` into org API source paths. */
export function materializeWidgetTemplate(template: WidgetTemplate, orgId: string): WidgetDoc {
  return {
    ...template.doc,
    sources: template.doc.sources.map((source) =>
      source.kind === 'orgApi'
        ? { ...source, path: source.path.replaceAll(':orgId', orgId) }
        : source,
    ),
  };
}
