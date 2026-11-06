import { describe, expect, test } from 'bun:test';
import { LoginSessions } from './login-sessions.ts';

function opened(): { sessions: LoginSessions; readerId: string } {
  const sessions = new LoginSessions();
  const readerId = 'reader-1';
  sessions.open(readerId, { phone: '+375000000000', apiId: 1, apiHash: 'hash' });
  return { sessions, readerId };
}

describe('login sessions', () => {
  test('submit before waitFor is buffered and consumed', async () => {
    const { sessions, readerId } = opened();
    expect(sessions.submit(readerId, 'code', '12345')).toBe(true);
    expect(await sessions.waitFor(readerId, 'code')).toBe('12345');
    expect(sessions.isWaiting(readerId)).toBe(null);
  });

  test('submit resolves a waiting prompt', async () => {
    const { sessions, readerId } = opened();
    const pending = sessions.waitFor(readerId, 'code');
    expect(sessions.isWaiting(readerId)).toBe('code');
    expect(sessions.submit(readerId, 'code', '54321')).toBe(true);
    expect(await pending).toBe('54321');
  });

  test('submit without a session reports failure', () => {
    const { sessions } = opened();
    expect(sessions.submit('missing-reader', 'code', '11111')).toBe(false);
  });

  test('close rejects the waiting prompt', async () => {
    const { sessions, readerId } = opened();
    const pending = sessions.waitFor(readerId, 'password');
    sessions.close(readerId, new Error('Login attempt expired'));
    await expect(pending).rejects.toThrow('Login attempt expired');
  });
});
