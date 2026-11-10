import { describe, expect, test } from 'bun:test';
import { InMemoryHostServiceRegistry } from './host-service-registry.adapter.ts';
import { PermissionDefinitionRegistry } from './permission-definitions.ts';
import { buildSpecModule, methodSpec } from './spec-fakes.ts';

const registryFactory = () => new InMemoryHostServiceRegistry(new PermissionDefinitionRegistry());

describe('InMemoryHostServiceRegistry', () => {
  test('register throws on duplicate method', () => {
    const registry = registryFactory();
    registry.register(
      buildSpecModule([methodSpec({ name: 'test.echo', handle: async () => ({ value: 1 }) })]),
    );
    expect(() =>
      registry.register(
        buildSpecModule([methodSpec({ name: 'test.echo', handle: async () => ({ value: 1 }) })]),
      ),
    ).toThrow(/duplicate/);
  });

  test('lookup resolves by namespace and method name', () => {
    const registry = registryFactory();
    registry.register(
      buildSpecModule([methodSpec({ name: 'test.echo', handle: async () => ({ value: 1 }) })]),
    );
    expect(registry.lookup('test', 'echo')).toBeDefined();
    expect(registry.lookup('other', 'echo')).toBeUndefined();
    expect(registry.modules()).toHaveLength(1);
  });

  test('validateBoot reports unknown permission', () => {
    const registry = registryFactory();
    registry.register(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          permission: 'nope.missing',
          handle: async () => ({ value: 1 }),
        }),
      ]),
    );
    expect(registry.validateBoot()).toEqual([
      { namespace: 'test', method: 'test.echo', code: 'unknown_permission' },
    ]);
  });

  test('validateBoot is clean for known permissions', () => {
    const registry = registryFactory();
    registry.register(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          permission: 'runs.dispatch',
          handle: async () => ({ value: 1 }),
        }),
      ]),
    );
    expect(registry.validateBoot()).toEqual([]);
  });
});
