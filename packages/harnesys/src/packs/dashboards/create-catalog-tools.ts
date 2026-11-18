import type { DashboardCatalogEntryDto } from '@harnesys/contracts';
import { dashboardCatalogResponse } from '@harnesys/contracts';
import type { CapabilityScope } from '../../domain/pack.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import {
  materializeTemplate,
  WIDGET_TEMPLATES,
  type WidgetTemplateSummary,
  widgetTemplateById,
  widgetTemplateSummaries,
} from './templates.ts';

export interface CatalogToolsDeps {
  resolveScope: () => CapabilityScope;
}

interface CatalogGetInput {
  id?: string;
}

interface TemplateGetInput {
  id: string;
}

function catalogEntries(id: string | undefined): DashboardCatalogEntryDto[] {
  const items = dashboardCatalogResponse().items;
  if (id === undefined) {
    return items;
  }
  return items.filter((entry) => entry.id === id);
}

export function createCatalogTools(deps: CatalogToolsDeps): ToolDefinition[] {
  return [
    tool('dashboard_catalog_get', {
      group: 'dashboards',
      description:
        'Org API catalog for widget sources: every entry with its method, path template (`:orgId` is your org id), query JSON Schema, response JSON Schema and the events/watch topics that invalidate it. Read this before binding a source so response paths in `bindings` match the real payload. Pass `id` for one entry.',
      input: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Catalog entry id, for example threads, approvals, agents, usage.',
          },
        },
        additionalProperties: false,
      },
      sideEffect: 'pure',
      execute: (raw) => {
        const input = raw as CatalogGetInput;
        return { items: catalogEntries(input.id) };
      },
    }),
    tool('dashboard_templates_list', {
      group: 'dashboards',
      description:
        'Starter widget templates with id, title, description, suggested rect and item/source counts. Call dashboard_templates_get to read the full WidgetDoc of one.',
      input: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      sideEffect: 'pure',
      execute: (): { items: WidgetTemplateSummary[] } => ({ items: widgetTemplateSummaries() }),
    }),
    tool('dashboard_templates_get', {
      group: 'dashboards',
      description:
        'Full WidgetDoc of one starter template, with `:orgId` already replaced by your org id so it can be passed to dashboard_widgets_create. Adjust the rect and the doc, then create it; every widget lands as a draft for human approval.',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Template id from dashboard_templates_list.' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      sideEffect: 'pure',
      execute: (raw) => {
        const { id } = raw as TemplateGetInput;
        const template = widgetTemplateById(id);
        if (template === undefined) {
          const known = WIDGET_TEMPLATES.map((entry) => entry.id).join(', ');
          return { error: true, message: `unknown template "${id}"; known: ${known}` };
        }
        return {
          id: template.id,
          title: template.title,
          description: template.description,
          rect: template.rect,
          doc: materializeTemplate(template, deps.resolveScope().orgId),
        };
      },
    }),
  ];
}
