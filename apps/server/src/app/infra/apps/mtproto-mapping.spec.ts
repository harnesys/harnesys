import { describe, expect, test } from 'bun:test';
import { mtprotoFailure } from './mtproto.adapter.ts';

describe('mtproto failure mapping', () => {
  test('flood seconds become rate_limited retryAfterSec', () => {
    const error = mtprotoFailure('flood', '', 42);
    expect(error.code).toBe('rate_limited');
    expect(error.meta?.retryAfterSec).toBe(42);
  });

  test('flood without valid seconds drops retryAfterSec', () => {
    expect(mtprotoFailure('flood', '', undefined).meta).toBeUndefined();
    expect(mtprotoFailure('flood', '', 0).meta).toBeUndefined();
    expect(mtprotoFailure('flood', '', 1.5).meta).toBeUndefined();
    expect(mtprotoFailure('flood', '', -3).meta).toBeUndefined();
  });

  test('bad request code families map to invalid_input', () => {
    for (const text of [
      'PHONE_CODE_INVALID',
      'PHONE_CODE_EXPIRED',
      'PHONE_NUMBER_INVALID',
      'PHONE_NUMBER_BANNED',
      'PASSWORD_HASH_INVALID',
      'PASSWORD_REQUIRED',
    ]) {
      expect(mtprotoFailure('bad_request', text).code).toBe('invalid_input');
      expect(mtprotoFailure('bad_request', text).meta).toBeUndefined();
    }
  });

  test('unauthorized family maps to invalid_credentials', () => {
    expect(mtprotoFailure('unauthorized', '').code).toBe('invalid_credentials');
    expect(mtprotoFailure('unauthorized', 'anything').code).toBe('invalid_credentials');
  });

  test('session and auth key texts map to invalid_credentials regardless of family', () => {
    for (const text of [
      'AUTH_KEY_UNREGISTERED',
      'AUTH_KEY_INVALID',
      'AUTH_KEY_DUPLICATED',
      'AUTHORIZED_USER_REQUIRED',
      'SESSION_EXPIRED',
      'SESSION_REVOKED',
      'SESSION_PROTECTED_DATA_INVALID',
    ]) {
      expect(mtprotoFailure('bad_request', text).code).toBe('invalid_credentials');
    }
  });

  test('everything else maps to invalid_response', () => {
    expect(mtprotoFailure('unclassified', 'DC_ID_INVALID').code).toBe('invalid_response');
    expect(mtprotoFailure('unclassified', '').code).toBe('invalid_response');
  });
});
