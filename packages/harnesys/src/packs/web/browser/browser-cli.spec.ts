import { describe, expect, test } from 'bun:test';
import { parseCdpPort } from './browser-cli.ts';

describe('parseCdpPort', () => {
  test('reads the port from a printed WebSocket URL', () => {
    expect(parseCdpPort('ws://127.0.0.1:9222/devtools/browser/abc')).toBe(9222);
  });
  test('reads the port from a JSON payload', () => {
    expect(parseCdpPort('{"success":true,"data":{"url":"wss://localhost:9333/x"}}')).toBe(9333);
  });
  test('rejects output without a CDP URL', () => {
    expect(parseCdpPort('[agent-browser] launched browser\nabout:blank')).toBeNull();
    expect(parseCdpPort('ws://127.0.0.1/devtools/browser/abc')).toBeNull();
  });
});
