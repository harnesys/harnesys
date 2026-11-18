import { describe, expect, test } from 'bun:test';
import type { WidgetDoc } from '@harnesys/contracts';
import { DashboardWidgetValidationException } from './dashboard.error.ts';
import type { WidgetDocIssue } from './widget-doc.guard.ts';
import { validateWidgetDoc } from './widget-doc.guard.ts';

const ORG_ID = 'acme';

interface DocFixture {
  [key: string]: unknown;
}

function compositeDoc(): DocFixture {
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
        on: {
          click: [
            {
              type: 'callApi',
              method: 'POST',
              path: { tpl: '/orgs/acme/approvals/{{row.id}}/decide' },
            },
            { type: 'refetchSource', sourceId: 'approvals' },
          ],
        },
      },
      {
        id: 'total',
        primitive: 'metric',
        rect: { x: 96, y: 0, w: 96, h: 64 },
        props: { label: 'Open' },
        bindings: { value: { ref: 'derived.open' } },
        on: {},
      },
    ],
  };
}

function validate(doc: DocFixture): WidgetDoc {
  return validateWidgetDoc(ORG_ID, doc);
}

function issuesOf(doc: DocFixture): WidgetDocIssue[] {
  try {
    validate(doc);
    return [];
  } catch (error) {
    if (error instanceof DashboardWidgetValidationException) {
      const details = error.details as { issues?: WidgetDocIssue[] } | undefined;
      return details?.issues ?? [];
    }
    throw error;
  }
}

function firstIssue(doc: DocFixture): WidgetDocIssue {
  const issues = issuesOf(doc);
  expect(issues.length).toBeGreaterThan(0);
  const issue = issues[0];
  if (issue === undefined) {
    throw new Error('expected a guard issue');
  }
  return issue;
}

function singleItem(doc: DocFixture, item: Record<string, unknown>): DocFixture {
  return { ...doc, derived: {}, items: [item] };
}

function buttonItem(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'action',
    primitive: 'button',
    rect: { x: 0, y: 0, w: 96, h: 32 },
    props: { label: 'Run' },
    bindings: {},
    on: {},
    ...overrides,
  };
}

describe('validateWidgetDoc', () => {
  test('valid composite doc parses, defaults and passes every invariant', () => {
    const parsed = validate(compositeDoc());
    expect(parsed.derived.open).toEqual({
      fn: 'count',
      args: [{ ref: 'sources.approvals.items' }],
    });
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.on.click).toBeDefined();
  });

  test('unknown event is reported against the item event key', () => {
    const doc = singleItem(compositeDoc(), buttonItem({ on: { submit: [] } }));
    expect(firstIssue(doc)).toEqual({
      path: 'items[0].on.submit',
      message: 'unknown event for button',
    });
  });

  test('invalid primitive props are reported with the prop path', () => {
    const doc = singleItem(compositeDoc(), buttonItem({ props: { label: 5 } }));
    expect(firstIssue(doc).path).toBe('items[0].props.label');
  });

  test('unknown binding root is reported against the binding prop', () => {
    const doc = singleItem(
      compositeDoc(),
      buttonItem({ bindings: { label: { ref: 'nowhere.path' } } }),
    );
    expect(firstIssue(doc)).toEqual({
      path: 'items[0].bindings.label',
      message: 'unknown binding root "nowhere"',
    });
  });

  test('derived cycle is rejected with the participating keys', () => {
    const doc = {
      ...compositeDoc(),
      items: [],
      derived: { a: { ref: 'derived.b' }, b: { ref: 'derived.a' } },
    };
    expect(firstIssue(doc)).toEqual({
      path: 'derived.a',
      message: 'derived cycle: a -> b -> a',
    });
  });

  test('fully dynamic callApi path is rejected because the org is unverifiable', () => {
    const doc = singleItem(
      compositeDoc(),
      buttonItem({
        on: {
          click: { type: 'callApi', method: 'POST', path: { ref: 'state.target' } },
        },
      }),
    );
    expect(firstIssue(doc)).toEqual({
      path: 'items[0].on.click.path',
      message: 'callApi path is a ref: the target org cannot be verified statically',
    });
  });
});
