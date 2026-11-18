import type { PackSkill } from '../../domain/pack.ts';

const BODY = `# Dashboard widgets

Authoring rules, the WidgetDoc contract, the Org API catalog and recipes live
in the \`widget-creator\` skill. Call \`load_skill\` with \`{ "name": "widget-creator" }\`
before writing a widget doc, and \`{ "name": "widget-creator", "file": "references/<name>.md" }\`
for a single reference.

Flow: read the dashboard, read \`dashboard_catalog_get\`, compose or take a
template from \`dashboard_templates_*\`, run \`dashboard_widgets_validate\`, then
\`dashboard_widgets_create\`. Every widget lands as a **draft**; a human approves
it in the dashboard UI.`;

export const dashboardWidgetAuthoringSkill: PackSkill = {
  name: 'dashboards-widget-authoring',
  description:
    'Pointer skill: load the widget-creator skill for the widget doc contract, catalog, recipes and workflow.',
  whenToUse:
    'Use when creating or updating dashboard widgets instead of composing a WidgetDoc from memory.',
  body: BODY,
};
