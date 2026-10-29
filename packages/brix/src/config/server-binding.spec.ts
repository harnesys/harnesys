import { describe, expect, test } from 'bun:test';
import { ServerBindingSchema } from './server-binding';

describe('ServerBindingSchema', () => {
  test('server binding has defaults without any input', () => {
    const binding = ServerBindingSchema.parse({});

    expect(binding.host).toBe('0.0.0.0');
    expect(binding.port).toBe(47474);
    expect(binding.api.prefix).toBe('api');
    expect(binding.api.version).toBeUndefined();
  });

  test('api.prefix defaults to api and version is absent by default', () => {
    const binding = ServerBindingSchema.parse({ api: {} });

    expect(binding.host).toBe('0.0.0.0');
    expect(binding.port).toBe(47474);
    expect(binding.api.prefix).toBe('api');
    expect(binding.api.version).toBeUndefined();
  });

  test('api.version is kept when configured', () => {
    const binding = ServerBindingSchema.parse({
      host: '127.0.0.1',
      port: 8080,
      api: { prefix: 'internal', version: 'v1' },
    });

    expect(binding.api.prefix).toBe('internal');
    expect(binding.api.version).toBe('v1');
  });

  test('null or empty api.version normalizes to no version', () => {
    expect(ServerBindingSchema.parse({ api: { version: null } }).api.version).toBeUndefined();
    expect(ServerBindingSchema.parse({ api: { version: '' } }).api.version).toBeUndefined();
  });
});
