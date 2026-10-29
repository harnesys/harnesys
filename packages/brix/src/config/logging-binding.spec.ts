import { describe, expect, test } from 'bun:test';
import { readLoggingConfig } from './logging-binding';

describe('readLoggingConfig', () => {
  test('reads level, pretty and file from the logging section', () => {
    const config = readLoggingConfig(
      {
        logging: {
          level: 'debug',
          pretty: true,
          file: { path: 'logs/app.log', maxSizeBytes: 1000, maxFiles: 3 },
        },
      },
      'production',
    );
    expect(config).toEqual({
      level: 'debug',
      pretty: true,
      file: { path: 'logs/app.log', maxSizeBytes: 1000, maxFiles: 3 },
    });
  });

  test('the configured level wins over the environment', () => {
    expect(readLoggingConfig({ logging: { level: 'trace' } }, 'test').level).toBe('trace');
  });

  test('falls back to silent level in the test environment', () => {
    expect(readLoggingConfig({}, 'test').level).toBe('silent');
  });

  test('falls back to info level outside the test environment', () => {
    expect(readLoggingConfig({}, undefined).level).toBe('info');
    expect(readLoggingConfig({ logging: {} }, 'production').level).toBe('info');
  });

  test('pretty is on outside production and off in production', () => {
    expect(readLoggingConfig({}, undefined).pretty).toBe(true);
    expect(readLoggingConfig({}, 'production').pretty).toBe(false);
    expect(readLoggingConfig({ logging: { pretty: true } }, 'production').pretty).toBe(true);
    expect(readLoggingConfig({ logging: { pretty: false } }, undefined).pretty).toBe(false);
  });

  test('applies file rotation defaults', () => {
    const config = readLoggingConfig({ logging: { file: { path: 'logs/app.log' } } }, undefined);
    expect(config.file).toEqual({ path: 'logs/app.log', maxSizeBytes: 10_485_760, maxFiles: 5 });
  });

  test('has no file sink by default', () => {
    expect(readLoggingConfig({}, undefined).file).toBeUndefined();
  });

  test('rejects invalid sections', () => {
    expect(() => readLoggingConfig({ logging: { level: 'loud' } }, undefined)).toThrow();
    expect(() => readLoggingConfig({ logging: { file: {} } }, undefined)).toThrow();
    expect(() =>
      readLoggingConfig({ logging: { file: { path: 'a.log', maxFiles: 0 } } }, undefined),
    ).toThrow();
  });
});
