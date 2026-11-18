import type { Action, ActionList, Expr, WidgetDoc } from '@harnesys/contracts';
import { orgApiRiskPrefix } from '@harnesys/contracts';

export type WidgetEffectKind = 'source' | 'callApi' | 'invokeExternal' | 'vault';

export interface WidgetEffect {
  kind: WidgetEffectKind;
  label: string;
  detail: string | null;
  risk: string | null;
}

const VAULT_REF_PATTERN = /\{\{vault:([A-Za-z][A-Za-z0-9_-]{0,63})\}\}/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Path expression as an author reads it: literal, template with the org filled in, or raw JSON. */
function pathText(expr: Expr, orgId: string): string {
  if (typeof expr === 'string') {
    return expr;
  }
  if (isRecord(expr) && typeof expr.tpl === 'string') {
    return expr.tpl.replaceAll('{{org.id}}', orgId);
  }
  return JSON.stringify(expr);
}

function literalPath(expr: Expr): string | null {
  if (typeof expr === 'string') {
    return expr;
  }
  if (isRecord(expr) && typeof expr.tpl === 'string') {
    return expr.tpl;
  }
  return null;
}

function actionsOf(list: ActionList | undefined): Action[] {
  if (list === undefined) {
    return [];
  }
  return Array.isArray(list) ? list : [list];
}

function walkAction(action: Action, visit: (action: Action) => void): void {
  visit(action);
  if (action.type === 'sequence') {
    for (const child of action.actions) {
      walkAction(child, visit);
    }
    return;
  }
  if (action.type === 'callApi') {
    for (const child of [...(action.onSuccess ?? []), ...(action.onError ?? [])]) {
      walkAction(child, visit);
    }
  }
}

function vaultNames(value: string): string[] {
  return [...value.matchAll(VAULT_REF_PATTERN)].map((match) => match[1] ?? '').filter(Boolean);
}

/** String leaves of an Expr tree: the tpl/literal parts a vault ref can hide in. */
function exprStrings(expr: unknown): string[] {
  if (typeof expr === 'string') {
    return [expr];
  }
  if (expr === null || typeof expr !== 'object') {
    return [];
  }
  if (Array.isArray(expr)) {
    return expr.flatMap(exprStrings);
  }
  if ('tpl' in expr && typeof expr.tpl === 'string') {
    return [expr.tpl];
  }
  if ('lit' in expr) {
    return typeof expr.lit === 'string' ? [expr.lit] : [];
  }
  if ('args' in expr && Array.isArray(expr.args)) {
    return expr.args.flatMap(exprStrings);
  }
  if ('ref' in expr) {
    return typeof expr.ref === 'string' ? [expr.ref] : [];
  }
  return Object.values(expr).flatMap((entry) =>
    entry === null || typeof entry !== 'object' ? [] : exprStrings(entry as Expr),
  );
}

export function widgetEffects(doc: WidgetDoc, orgId: string): WidgetEffect[] {
  const effects: WidgetEffect[] = [];
  for (const source of doc.sources) {
    if (source.kind === 'orgApi') {
      effects.push({
        kind: 'source',
        label: `${source.method} ${source.path}`,
        detail: `orgApi · ${source.id}`,
        risk: orgApiRiskPrefix(source.path),
      });
      continue;
    }
    effects.push({
      kind: 'source',
      label: `${source.method} ${hostOf(source.url)}`,
      detail: `external · ${source.id}`,
      risk: null,
    });
    const headerRefs = Object.values(source.headers ?? {}).flatMap(vaultNames);
    const urlRefs = vaultNames(source.url);
    // Query values are Exprs; the server resolves {{vault:name}} in their
    // string leaves, so those secrets belong on the approval list too.
    const queryRefs = Object.values(source.query ?? {}).flatMap((expr) =>
      exprStrings(expr).flatMap(vaultNames),
    );
    const declared = (source.secretRefs ?? []).map((ref) =>
      ref.replace(/^\{\{vault:(.+)\}\}$/, '$1'),
    );
    for (const name of new Set([...declared, ...headerRefs, ...urlRefs, ...queryRefs])) {
      effects.push({
        kind: 'vault',
        label: `Vault entry "${name}"`,
        detail: source.id,
        risk: null,
      });
    }
  }
  for (const item of doc.items) {
    const actions = Object.values(item.on).flatMap((list) => actionsOf(list));
    if (item.action) {
      actions.push(item.action);
    }
    for (const action of actions.flatMap((entry) => {
      const collected: Action[] = [];
      walkAction(entry, (node) => collected.push(node));
      return collected;
    })) {
      if (action.type === 'callApi') {
        const literal = literalPath(action.path);
        effects.push({
          kind: 'callApi',
          label: `${action.method} ${pathText(action.path, orgId)}`,
          detail: item.id,
          risk: literal ? orgApiRiskPrefix(literal.replaceAll('{{org.id}}', orgId)) : null,
        });
      }
      if (action.type === 'invokeExternal') {
        effects.push({
          kind: 'invokeExternal',
          label: `Invoke external source "${action.sourceId}"`,
          detail: item.id,
          risk: null,
        });
      }
    }
  }
  return effects;
}
