import { describe, expect, test } from 'bun:test';
import { ACCOUNT_STATUS_BY_ERROR, isAccountErrorCode, statusForError } from './status-map.ts';

describe('status-map', () => {
  test('maps credential health codes to expired', () => {
    for (const code of ['invalid_credentials', 'expired', 'revoked', 'insufficient_scopes']) {
      expect(statusForError(code as never)).toBe('expired');
    }
  });

  test('maps transport and response codes to error', () => {
    for (const code of [
      'rate_limited',
      'provider_unavailable',
      'invalid_response',
      'not_found',
      'unknown',
      'identity_mismatch',
    ]) {
      expect(statusForError(code as never)).toBe('error');
    }
  });

  test('maps connect and webhook codes to null', () => {
    for (const code of ['denied', 'invalid_signature', 'invalid_input', 'session_expired']) {
      expect(statusForError(code as never)).toBeNull();
    }
  });

  test('membership check accepts every table key and rejects junk', () => {
    for (const code of Object.keys(ACCOUNT_STATUS_BY_ERROR)) {
      expect(isAccountErrorCode(code)).toBe(true);
    }
    expect(isAccountErrorCode('definitely_not_a_code')).toBe(false);
    expect(isAccountErrorCode('')).toBe(false);
    expect(isAccountErrorCode('Identity_Mismatch')).toBe(false);
  });
});
