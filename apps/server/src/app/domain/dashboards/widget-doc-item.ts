import type { Action, Expr, WidgetDoc, WidgetItem } from '@harnesys/contracts';
import { parseOrgApiPath, primitiveById } from '@harnesys/contracts';
import { z } from 'zod';
import { isRecord, pushRefIssues, pushRowBindingIssues, resolveRef } from './widget-doc-expr.ts';
import { type ScopedIssue, zodIssues } from './widget-doc-issue.ts';

interface ActionEntry {
  field: string;
  expr: Expr;
}

export interface ItemCheckContext {
  orgId: string;
  doc: WidgetDoc;
  sourceIds: Set<string>;
  issues: ScopedIssue[];
  seenItemIds: Set<string>;
}

/**
 * Item invariants: props parse with the primitive descriptor, every `on` key
 * exists in that descriptor's events, every binding root resolves, and every
 * `callApi` path names the widget org. Legacy items with only `action` go
 * through the same action checks.
 */
export function checkItem(item: WidgetItem, index: number, ctx: ItemCheckContext): void {
  const base = `items[${index}]`;
  if (ctx.seenItemIds.has(item.id)) {
    ctx.issues.push({
      path: `${base}.id`,
      message: `duplicate widget item id "${item.id}"`,
      itemId: item.id,
    });
  }
  ctx.seenItemIds.add(item.id);
  const descriptor = primitiveById(item.primitive);
  if (descriptor === undefined) {
    ctx.issues.push({
      path: `${base}.primitive`,
      message: `unknown primitive "${item.primitive}"`,
      itemId: item.id,
    });
    return;
  }
  checkProps(item, base, descriptor.props, ctx);
  pushRowBindingIssues(item.props, ctx.doc, ctx.sourceIds, {
    path: base,
    issues: ctx.issues,
    itemId: item.id,
  });
  for (const event of Object.keys(item.on)) {
    if (!Object.hasOwn(descriptor.events, event)) {
      ctx.issues.push({
        path: `${base}.on.${event}`,
        message: `unknown event for ${item.primitive}`,
        itemId: item.id,
      });
    }
  }
  checkBindings(item, base, descriptor.props, ctx);
  if (item.visibleWhen !== undefined) {
    pushRefIssues(item.visibleWhen, ctx.doc, ctx.sourceIds, 'reference', {
      path: `${base}.visibleWhen`,
      issues: ctx.issues,
      itemId: item.id,
    });
  }
  for (const [event, actions] of Object.entries(item.on)) {
    const listed = Array.isArray(actions) ? actions : [actions];
    listed.forEach((action, actionIndex) => {
      const path = Array.isArray(actions)
        ? `${base}.on.${event}[${actionIndex}]`
        : `${base}.on.${event}`;
      checkAction(action, path, item.id, ctx);
    });
  }
  if (item.action !== undefined) {
    checkAction(item.action, `${base}.action`, item.id, ctx);
  }
}

function checkProps(
  item: WidgetItem,
  base: string,
  propsSchema: z.ZodType,
  ctx: ItemCheckContext,
): void {
  const props = propsSchema.safeParse(item.props);
  if (props.success) {
    checkLegacyActionPaths(item, base, ctx);
    return;
  }
  for (const issue of zodIssues(props.error, `${base}.props`)) {
    ctx.issues.push({ ...issue, itemId: item.id });
  }
}

/**
 * The legacy `actions` primitive keeps orgApi button calls in its props
 * (`buttons[].action`); they must pass the same path guard as `callApi`.
 */
function checkLegacyActionPaths(item: WidgetItem, base: string, ctx: ItemCheckContext): void {
  if (item.primitive !== 'actions') {
    return;
  }
  const buttons = item.props.buttons;
  if (!Array.isArray(buttons)) {
    return;
  }
  buttons.forEach((button, index) => {
    const action = (button as Record<string, unknown>)?.action as
      | Record<string, unknown>
      | undefined;
    if (action === null || typeof action !== 'object') {
      return;
    }
    const path = typeof action.path === 'string' ? action.path : null;
    if (path === null) {
      return;
    }
    const problem = callApiPathIssue(path, ctx.orgId);
    if (problem !== null) {
      ctx.issues.push({
        path: `${base}.props.buttons[${index}].action.path`,
        message: problem,
        itemId: item.id,
      });
    }
  });
}

function checkBindings(
  item: WidgetItem,
  base: string,
  propsSchema: z.ZodType,
  ctx: ItemCheckContext,
): void {
  const declared = z.toJSONSchema(propsSchema);
  const properties = isRecord(declared.properties) ? declared.properties : {};
  for (const [prop, expr] of Object.entries(item.bindings)) {
    const path = `${base}.bindings.${prop}`;
    if (!Object.hasOwn(properties, prop)) {
      ctx.issues.push({
        path,
        message: `unknown prop "${prop}" for ${item.primitive}`,
        itemId: item.id,
      });
      continue;
    }
    if (typeof expr === 'string') {
      const problem = resolveRef(expr, ctx.doc, ctx.sourceIds, 'binding');
      if (problem !== null) {
        ctx.issues.push({ path, message: problem, itemId: item.id });
      }
      continue;
    }
    pushRefIssues(expr, ctx.doc, ctx.sourceIds, 'binding', {
      path,
      issues: ctx.issues,
      itemId: item.id,
    });
  }
}

function checkAction(action: Action, path: string, itemId: string, ctx: ItemCheckContext): void {
  if (action.type === 'callApi') {
    const problem = callApiPathIssue(action.path, ctx.orgId);
    if (problem !== null) {
      ctx.issues.push({ path: `${path}.path`, message: problem, itemId });
    }
  }
  for (const entry of actionExprs(action)) {
    pushRefIssues(entry.expr, ctx.doc, ctx.sourceIds, 'reference', {
      path: `${path}.${entry.field}`,
      issues: ctx.issues,
      itemId,
    });
  }
  for (const nested of nestedActions(action)) {
    checkAction(nested.action, `${path}.${nested.field}`, itemId, ctx);
  }
}

function actionExprs(action: Action): ActionEntry[] {
  const entries: ActionEntry[] = [];
  switch (action.type) {
    case 'setState':
      entries.push({ field: 'value', expr: action.value });
      break;
    case 'incrementState':
      entries.push({ field: 'delta', expr: action.delta });
      break;
    case 'callApi':
      entries.push({ field: 'path', expr: action.path });
      if (action.query !== undefined) {
        entries.push({ field: 'query', expr: action.query });
      }
      if (action.body !== undefined) {
        entries.push({ field: 'body', expr: action.body });
      }
      break;
    case 'invokeExternal':
      if (action.params !== undefined) {
        entries.push({ field: 'params', expr: action.params });
      }
      break;
    case 'navigate':
      entries.push({ field: 'to', expr: action.to });
      break;
    case 'notify':
      entries.push({ field: 'message', expr: action.message });
      break;
    default:
      break;
  }
  return entries;
}

function nestedActions(action: Action): { field: string; action: Action }[] {
  const nested: { field: string; action: Action }[] = [];
  if (action.type === 'sequence') {
    action.actions.forEach((entry, index) => {
      nested.push({ field: `actions[${index}]`, action: entry });
    });
  }
  if (action.type === 'callApi') {
    action.onSuccess?.forEach((entry, index) => {
      nested.push({ field: `onSuccess[${index}]`, action: entry });
    });
    action.onError?.forEach((entry, index) => {
      nested.push({ field: `onError[${index}]`, action: entry });
    });
  }
  return nested;
}

/**
 * Literal strings and `tpl` templates are checked against the caller's org. A
 * `tpl` is checked by its literal prefix: the org segment must be static, only
 * the tail may interpolate. A `ref`/`fn` path has no verifiable org at save time.
 */
function callApiPathIssue(path: Expr, orgId: string): string | null {
  if (typeof path === 'string') {
    return orgPathIssue(path, orgId);
  }
  if (isRecord(path)) {
    if (typeof path.ref === 'string') {
      return 'callApi path is a ref: the target org cannot be verified statically';
    }
    if (typeof path.fn === 'string') {
      return 'callApi path is a fn call: the target org cannot be verified statically';
    }
    if (typeof path.tpl === 'string') {
      const tokenIndex = path.tpl.search(/\{\{/);
      if (tokenIndex === -1) {
        return orgPathIssue(path.tpl, orgId);
      }
      const prefix = path.tpl.slice(0, tokenIndex).replace(/\/+$/, '');
      const checked = parseOrgApiPath(prefix, orgId);
      return checked.ok
        ? null
        : `callApi path template prefix "${prefix}" must start with /orgs/${orgId}/: ${checked.reason}`;
    }
  }
  return 'callApi path must be a string or a tpl template with a literal /orgs/<orgId> prefix';
}

function orgPathIssue(raw: string, orgId: string): string | null {
  const checked = parseOrgApiPath(raw, orgId);
  return checked.ok ? null : `callApi path must target the widget org: ${checked.reason}`;
}
