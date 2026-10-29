import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import type { ZodType } from 'zod';
import { z } from 'zod';
import { Container } from '../di/container';
import { Injectable } from '../di/injectable';
import { ConfigModule } from './config-module';
import { ConfigService } from './config-service';
import { CONFIG } from './config-tokens';
import { Configuration } from './configuration';

const TestConfigSchema = z.object({
  app: z.object({ name: z.string() }),
});

type TestConfig = z.infer<typeof TestConfigSchema>;

function buildContainer(raw: unknown, schema?: ZodType): Container {
  const dynamic = ConfigModule.forRoot({ schema, preloadedConfig: raw });
  const container = new Container();
  for (const provider of dynamic.providers ?? []) {
    container.register(provider);
  }
  return container;
}

function configOf(raw: unknown, schema?: ZodType): Record<string, unknown> {
  return buildContainer(raw, schema).resolve<Record<string, unknown>>(CONFIG);
}

@Injectable()
class ConfigConsumer {
  constructor(@Configuration() readonly config: TestConfig) {}
}

describe('ConfigService', () => {
  test('merges user sections with framework sections', () => {
    const config = configOf({ app: { name: 'demo' }, server: { port: 47474 } }, TestConfigSchema);
    expect(config).toEqual({
      app: { name: 'demo' },
      server: { host: '0.0.0.0', port: 47474, api: { prefix: 'api' } },
    });
  });

  test('applies framework defaults when server is absent', () => {
    const config = configOf({ app: { name: 'demo' } }, TestConfigSchema);
    expect(config.server).toEqual({ host: '0.0.0.0', port: 47474, api: { prefix: 'api' } });
    expect(config.logging).toBeUndefined();
  });

  test('keeps the logging section when configured', () => {
    const config = configOf(
      { app: { name: 'demo' }, logging: { level: 'debug' } },
      TestConfigSchema,
    );
    expect(config.logging).toEqual({ level: 'debug' });
  });

  test('strips user sections that the app schema does not declare', () => {
    const config = configOf({ app: { name: 'demo' }, extra: 1 }, TestConfigSchema);
    expect(config.extra).toBeUndefined();
  });

  test('keeps undeclared sections when no app schema is given', () => {
    const config = configOf({ anything: { nested: true }, server: { port: 1 } });
    expect(config.anything).toEqual({ nested: true });
    expect(config.server).toEqual({ host: '0.0.0.0', port: 1, api: { prefix: 'api' } });
  });

  test('Configuration() injects config into consumers', () => {
    const container = buildContainer(
      { app: { name: 'demo' }, server: { port: 47474 } },
      TestConfigSchema,
    );
    container.register(ConfigConsumer);
    expect(container.resolve<ConfigConsumer>(ConfigConsumer).config.app.name).toBe('demo');
  });

  test('ConfigService.config holds the same object', () => {
    const container = buildContainer({ app: { name: 'demo' } }, TestConfigSchema);
    const service = container.resolve<ConfigService<Record<string, unknown>>>(ConfigService);
    expect(service.config).toEqual({
      app: { name: 'demo' },
      server: { host: '0.0.0.0', port: 47474, api: { prefix: 'api' } },
    });
  });

  test('invalid raw config throws on resolve', () => {
    expect(() => configOf({ server: { port: 'bad' } })).toThrow();
    expect(() => configOf({ app: 1 }, TestConfigSchema)).toThrow();
    expect(() => configOf({ server: { port: 47474 } }, z.object({ app: z.string() }))).toThrow();
  });

  test('forRoot exports service and config token', () => {
    const dynamic = ConfigModule.forRoot({ preloadedConfig: {} });
    expect(dynamic.exports).toContain(ConfigService);
    expect(dynamic.exports).toContain(CONFIG);
    expect(dynamic.global).toBe(true);
  });
});
