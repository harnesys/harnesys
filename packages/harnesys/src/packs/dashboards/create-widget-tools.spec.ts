import { describe, expect, test } from 'bun:test';
import { WidgetSourceTestBodySchema } from '@harnesys/contracts';
import { validateToolInput } from '../../application/tool-registry.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { createWidgetTools } from './create-widget-tools.ts';
import type { DashboardsPackPort } from './port.ts';

const ctx = {} as ToolContext;

function scope(): CapabilityScope {
  return { orgId: 'acme', agentId: 'agent-1', sourceIds: [], threadId: 'thread-1' };
}

function named(name: string): ToolDefinition {
  const def = createWidgetTools({
    dashboards: {} as DashboardsPackPort,
    resolveScope: scope,
  }).find((item) => item.name === name);
  if (def === undefined) {
    throw new Error(`${name} tool missing`);
  }
  return def;
}

function unionBrokenDoc(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    title: 'Ghosted',
    sources: [],
    derived: {},
    items: [
      {
        id: 'action',
        primitive: 'button',
        rect: { x: 0, y: 0, w: 96, h: 32 },
        props: { label: 'Run' },
        bindings: {},
        on: { click: [{ type: 'set' }] },
      },
    ],
  };
}

function validDoc(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    title: 'Approvals',
    state: { filter: 'open' },
    sources: [{ kind: 'orgApi', id: 'approvals', path: '/orgs/acme/approvals' }],
    derived: { open: { fn: 'count', args: [{ ref: 'sources.approvals.items' }] } },
    items: [
      {
        id: 'approve',
        primitive: 'button',
        rect: { x: 0, y: 0, w: 96, h: 32 },
        props: { label: 'Approve' },
        bindings: { label: { ref: 'state.filter' } },
        on: { click: [{ type: 'refetchSource', sourceId: 'approvals' }] },
      },
    ],
  };
}

describe('dashboard_widgets_validate tool input', () => {
  test('the doc property is loose so a union-broken doc reaches checkWidgetDoc, not Ajv', async () => {
    const validate = named('dashboard_widgets_validate');
    const docSchema = (
      (validate.input as { properties: Record<string, unknown> }).properties as Record<
        string,
        unknown
      >
    ).doc as Record<string, unknown>;
    expect(Object.keys(docSchema).sort()).toEqual(['description', 'type']);
    expect(validateToolInput(validate.input, { doc: unionBrokenDoc() }).ok).toBe(true);
  });

  test('validate answers flat { path, message } issues instead of an arm dump', async () => {
    const out = (await named('dashboard_widgets_validate').execute(
      { doc: unionBrokenDoc() },
      ctx,
    )) as { ok: boolean; issues: { path: string; message: string }[] };
    expect(out.ok).toBe(false);
    expect(out.issues.length).toBeGreaterThan(0);
    for (const issue of out.issues) {
      expect(typeof issue.path).toBe('string');
      expect(typeof issue.message).toBe('string');
    }
  });

  test('validate accepts the doc the write path would store', async () => {
    const out = (await named('dashboard_widgets_validate').execute({ doc: validDoc() }, ctx)) as {
      ok: boolean;
      issues: unknown[];
    };
    expect(out).toEqual({ ok: true, issues: [] });
  });

  test('create keeps strict pre-validation of the full doc', () => {
    const create = named('dashboard_widgets_create');
    expect(
      validateToolInput(create.input, {
        dashboardId: 'd1',
        rect: { x: 0, y: 0, w: 96, h: 32 },
        doc: unionBrokenDoc(),
      }).ok,
    ).toBe(false);
    expect(
      validateToolInput(create.input, {
        dashboardId: 'd1',
        rect: { x: 0, y: 0, w: 96, h: 32 },
        doc: validDoc(),
      }).ok,
    ).toBe(true);
  });
});

function methodlessOrgApiSource(): Record<string, unknown> {
  return { kind: 'orgApi', id: 'approvals', path: '/orgs/acme/approvals' };
}

describe('dashboard_widgets_test source contract seam', () => {
  test('the tool input accepts a method-less orgApi source without pre-rejection', () => {
    const testTool = named('dashboard_widgets_test');
    expect(validateToolInput(testTool.input, { source: methodlessOrgApiSource() }).ok).toBe(true);
  });

  test('a method-less orgApi source is forwarded untouched and the entry schema tests it as GET', async () => {
    const forwarded: unknown[] = [];
    const def = createWidgetTools({
      dashboards: {
        testSource: async (_orgId: string, source: unknown) => {
          forwarded.push(source);
          return { ok: true };
        },
      } as DashboardsPackPort,
      resolveScope: scope,
    }).find((item) => item.name === 'dashboard_widgets_test');
    if (def === undefined) {
      throw new Error('dashboard_widgets_test tool missing');
    }
    await def.execute({ source: methodlessOrgApiSource() }, ctx);
    expect(forwarded.length).toBe(1);
    expect(forwarded[0]).toEqual(methodlessOrgApiSource());
    const withoutMethod = WidgetSourceTestBodySchema.parse({ source: forwarded[0] });
    const withGet = WidgetSourceTestBodySchema.parse({
      source: { ...methodlessOrgApiSource(), method: 'GET' },
    });
    expect(withoutMethod.source.method).toBe('GET');
    expect(withoutMethod).toEqual(withGet);
  });
});
