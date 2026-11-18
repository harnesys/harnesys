import { describe, expect, it } from 'bun:test';
import { CATALOG_ENTRIES } from '../catalog/index.ts';
import { WidgetDocSchema } from '../doc.ts';
import { primitiveById } from '../primitives/index.ts';
import { materializeWidgetTemplate, WIDGET_TEMPLATES } from './index.ts';

const ORG_ID = 'acme';

describe('widget templates', () => {
  it('every template parses as a widget doc', () => {
    for (const template of WIDGET_TEMPLATES) {
      const parsed = WidgetDocSchema.safeParse(materializeWidgetTemplate(template, ORG_ID));
      expect({ id: template.id, ok: parsed.success }).toEqual({ id: template.id, ok: true });
    }
  });

  it('ids are unique and source paths target the materialized org', () => {
    const ids = WIDGET_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of WIDGET_TEMPLATES) {
      const doc = materializeWidgetTemplate(template, ORG_ID);
      for (const source of doc.sources) {
        expect(source.kind === 'orgApi' && source.path.startsWith(`/orgs/${ORG_ID}/`)).toBe(true);
      }
    }
  });

  it('every item rect is on the 8 px grid and fits inside its widget', () => {
    for (const template of WIDGET_TEMPLATES) {
      expect(template.rect.w % 8).toBe(0);
      expect(template.rect.h % 8).toBe(0);
      const doc = materializeWidgetTemplate(template, ORG_ID);
      for (const item of doc.items) {
        const rect = item.rect;
        expect({
          id: template.id,
          item: item.id,
          grid: [rect.x, rect.y, rect.w, rect.h].every((value) => value % 8 === 0),
        }).toEqual({
          id: template.id,
          item: item.id,
          grid: true,
        });
        expect({
          id: template.id,
          item: item.id,
          fits: rect.x + rect.w <= template.rect.w && rect.y + rect.h <= template.rect.h,
        }).toEqual({
          id: template.id,
          item: item.id,
          fits: true,
        });
      }
    }
  });

  it('every item prop parses with its descriptor and every event exists', () => {
    for (const template of WIDGET_TEMPLATES) {
      const doc = materializeWidgetTemplate(template, ORG_ID);
      const itemIds = new Set(doc.items.map((item) => item.id));
      expect({ id: template.id, uniqueIds: itemIds.size === doc.items.length }).toEqual({
        id: template.id,
        uniqueIds: true,
      });
      for (const item of doc.items) {
        const descriptor = primitiveById(item.primitive);
        expect({
          id: template.id,
          item: item.id,
          primitiveExists: descriptor !== undefined,
        }).toEqual({
          id: template.id,
          item: item.id,
          primitiveExists: true,
        });
        if (!descriptor) {
          continue;
        }
        const props = descriptor.props.safeParse(item.props);
        expect({ id: template.id, item: item.id, props: props.success }).toEqual({
          id: template.id,
          item: item.id,
          props: true,
        });
        for (const event of Object.keys(item.on)) {
          expect({
            id: template.id,
            item: item.id,
            event,
            declared: Object.hasOwn(descriptor.events, event),
          }).toEqual({
            id: template.id,
            item: item.id,
            event,
            declared: true,
          });
        }
      }
    }
  });

  it('org API sources name shipped catalog entries', () => {
    const paths = new Set(CATALOG_ENTRIES.map((entry) => entry.path.replaceAll(':orgId', ORG_ID)));
    for (const template of WIDGET_TEMPLATES) {
      for (const source of materializeWidgetTemplate(template, ORG_ID).sources) {
        if (source.kind === 'orgApi') {
          expect(paths.has(source.path)).toBe(true);
        }
      }
    }
  });
});
