import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { PRIMITIVE_IDS, PRIMITIVES } from './index.ts';

describe('primitive registry', () => {
  test('primitive ids are unique', () => {
    expect(new Set(PRIMITIVE_IDS).size).toBe(PRIMITIVE_IDS.length);
  });

  test('every descriptor is listed exactly once', () => {
    expect(PRIMITIVE_IDS).toEqual(PRIMITIVES.map((primitive) => primitive.id));
  });

  test('hidden primitives are limited to legacy ones', () => {
    for (const primitive of PRIMITIVES) {
      if ('hidden' in primitive && primitive.hidden) {
        expect(['actions', 'custom']).toContain(primitive.id);
      }
    }
  });

  for (const primitive of PRIMITIVES) {
    test(`${primitive.id} descriptor is complete`, () => {
      expect(primitive.title.length).toBeGreaterThan(0);
      expect(primitive.description.length).toBeGreaterThan(0);
      expect(primitive.category.length).toBeGreaterThan(0);
      expect(primitive.layout.defaultW).toBeGreaterThan(0);
      expect(primitive.layout.defaultH).toBeGreaterThan(0);
      expect(primitive.layout.minW).toBeGreaterThan(0);
      expect(primitive.layout.minH).toBeGreaterThan(0);
      expect(primitive.layout.minW).toBeLessThanOrEqual(primitive.layout.defaultW);
      expect(primitive.layout.minH).toBeLessThanOrEqual(primitive.layout.defaultH);
      expect(typeof primitive.defaults).toBe('object');
      expect(primitive.defaults).not.toBeNull();
    });

    test(`${primitive.id} props convert to JSON schema`, () => {
      const jsonSchema = z.toJSONSchema(primitive.props);
      expect(jsonSchema).toBeTypeOf('object');
    });

    test(`${primitive.id} defaults are declared props and parse`, () => {
      const properties = z.toJSONSchema(primitive.props).properties ?? {};
      for (const key of Object.keys(primitive.defaults)) {
        expect({ id: primitive.id, key, declared: Object.hasOwn(properties, key) }).toEqual({
          id: primitive.id,
          key,
          declared: true,
        });
      }
      const parsed = primitive.props.safeParse(primitive.defaults);
      expect({ id: primitive.id, ok: parsed.success }).toEqual({ id: primitive.id, ok: true });
    });

    test(`${primitive.id} defaults are JSON values`, () => {
      for (const value of Object.values(primitive.defaults)) {
        expect(() => JSON.stringify(value)).not.toThrow();
      }
    });
  }
});
