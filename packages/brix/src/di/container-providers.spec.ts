import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { Container } from './container';
import { Injectable } from './injectable';
import { Module } from './module';
import { buildModuleGraph } from './module-graph';

describe('provider shorthand', () => {
  test('registers a bare class provider by its class token', () => {
    @Injectable()
    class Service {
      readonly name = 'service';
    }

    @Module({ providers: [Service] })
    class ShorthandModule {}

    const container = new Container();
    container.registerModules(buildModuleGraph([ShorthandModule]));

    expect(container.has(Service)).toBe(true);
    expect(container.resolveFrom<Service>(ShorthandModule, Service).name).toBe('service');
  });

  test('rejects a bare class provider without @Injectable()', () => {
    class Plain {}

    @Module({ providers: [Plain] })
    class BadShorthandModule {}

    let message = '';
    try {
      new Container().registerModules(buildModuleGraph([BadShorthandModule]));
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('@Injectable()');
    expect(message).toContain('Plain');
    expect(message).toContain('BadShorthandModule');
  });
});
