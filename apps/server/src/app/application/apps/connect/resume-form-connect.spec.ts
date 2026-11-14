import { describe, expect, test } from 'bun:test';
import {
  InvalidFieldsException,
  ProviderError,
  SessionNotFoundException,
} from '../../../domain/apps/errors.ts';
import type { FieldSpec } from '../../../domain/apps/field.ts';
import {
  connectResult,
  harness,
  NO_RESUME_KIND,
  NOW,
  sessionRecord,
  resumeStubs as stubs,
} from './resume-form-connect.spec-fakes.ts';
import { MAX_SESSION_RESUMES } from './resume-form-connect.use-case.ts';

const ACTOR = {
  orgId: 'org-1',
  sessionId: 'sess-1',
  principalId: 'user-1',
  inputs: {},
};

describe('resume form connect', () => {
  test('valid inputs resume to completed, merge into inputs and reach the provider', async () => {
    const session = sessionRecord();
    const h = harness(session);
    stubs.impl = async (ctx) => ({ type: 'done', result: connectResult(ctx) });
    const response = await h.useCase.execute({
      ...ACTOR,
      inputs: { email: 'user@spec.test', attempts: 2 },
    });
    expect(response.session).toEqual({ status: 'completed', target: 'account', id: 'acc-1' });
    expect('launch' in response).toBe(false);
    expect(h.context.seen).toHaveLength(1);
    expect(h.context.seen[0]?.params).toEqual({ email: 'user@spec.test', attempts: '2' });
    expect(h.context.seen[0]?.sessionState).toEqual({ step: 'ask' });
    expect(session.inputs).toEqual({ email: 'user@spec.test', attempts: 2 });
    expect(session.status).toBe('completed');
    expect(session.result).toEqual({ target: 'account', id: 'acc-1' });
    expect(h.finalizer.finalized).toHaveLength(1);
    expect(h.finalizer.finalized[0]?.inputs).toEqual(session.inputs);
    expect(h.sessions.saved).toHaveLength(1);
  });

  test('invalid inputs throw 422 invalid_fields and never reach the provider', async () => {
    const h = harness(sessionRecord());
    stubs.impl = async () => {
      throw new Error('must not run');
    };
    try {
      await h.useCase.execute({ ...ACTOR, inputs: { extra: 'x' } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidFieldsException);
      const fieldsError = error as InvalidFieldsException;
      expect(fieldsError.status).toBe(422);
      expect(fieldsError.fields).toEqual({ email: 'required', extra: 'unknown' });
    }
  });

  test('guards reject unknown, foreign, terminal and non-form sessions', async () => {
    stubs.impl = null;
    await expect(
      harness(sessionRecord()).useCase.execute({ ...ACTOR, sessionId: 'missing' }),
    ).rejects.toThrow(SessionNotFoundException);
    await expect(
      harness(sessionRecord()).useCase.execute({ ...ACTOR, principalId: 'someone-else' }),
    ).rejects.toThrow(SessionNotFoundException);
    await expect(
      harness(sessionRecord({ status: 'completed' })).useCase.execute(ACTOR),
    ).rejects.toThrow(SessionNotFoundException);
    await expect(
      harness(sessionRecord({ launchFormFields: [] })).useCase.execute(ACTOR),
    ).rejects.toThrow(SessionNotFoundException);
  });

  test('resume cap marks the session failed as session_expired', async () => {
    const session = sessionRecord({ resumeCount: MAX_SESSION_RESUMES });
    const h = harness(session);
    stubs.impl = async () => {
      throw new Error('must not run');
    };
    const response = await h.useCase.execute(ACTOR);
    expect(response.session).toEqual({ status: 'failed', error: 'session_expired' });
    expect(session.status).toBe('failed');
    expect(session.error).toBe('session_expired');
    expect(session.resumeCount).toBe(MAX_SESSION_RESUMES + 1);
    expect(session.expiresAt).toBeGreaterThan(NOW);
    expect(h.sessions.saved).toHaveLength(1);
  });

  test('expired pending session is failed as session_expired', async () => {
    const session = sessionRecord({ expiresAt: NOW - 1 });
    const h = harness(session);
    stubs.impl = null;
    const response = await h.useCase.execute({ ...ACTOR, inputs: { email: 'user@spec.test' } });
    expect(response.session).toEqual({ status: 'failed', error: 'session_expired' });
    expect(h.sessions.saved).toHaveLength(1);
  });

  test('provider wait returns pending and replaces launch, state and ttl', async () => {
    const session = sessionRecord();
    const h = harness(session);
    const second: FieldSpec[] = [
      { key: 'code2', label: 'Second code', type: 'text', required: true },
    ];
    stubs.impl = async () => ({
      type: 'wait',
      launch: { kind: 'form', fields: second },
      state: { step: 'confirm' },
      ttlSec: 7200,
    });
    const response = await h.useCase.execute({ ...ACTOR, inputs: { email: 'user@spec.test' } });
    expect(response.session.status).toBe('pending');
    if (response.launch?.kind !== 'form') {
      expect.unreachable();
    }
    expect(response.launch.fields).toEqual(second);
    expect(session.providerState).toEqual({ step: 'confirm' });
    expect(session.launchFormFields).toEqual(second);
    expect(session.launchHtml).toBeNull();
    expect(session.expiresAt).toBe(NOW + 3_600_000);
    expect(h.sessions.saved).toHaveLength(1);
  });

  test('ProviderError with retryAfterSec meta surfaces it on failed event and session', async () => {
    const session = sessionRecord();
    const h = harness(session);
    stubs.impl = async () => {
      throw new ProviderError('rate_limited', { retryAfterSec: 42 });
    };
    const response = await h.useCase.execute({ ...ACTOR, inputs: { email: 'user@spec.test' } });
    expect(response.session).toEqual({
      status: 'failed',
      error: 'rate_limited',
      retryAfterSec: 42,
    });
    expect(session.status).toBe('failed');
    expect(session.error).toBe('rate_limited');
    expect(session.retryAfterSec).toBe(42);
  });

  test('ProviderError without meta omits retryAfterSec', async () => {
    const session = sessionRecord();
    const h = harness(session);
    stubs.impl = async () => {
      throw new ProviderError('invalid_input');
    };
    const response = await h.useCase.execute({ ...ACTOR, inputs: { email: 'user@spec.test' } });
    expect(response.session).toEqual({ status: 'failed', error: 'invalid_input' });
    expect('retryAfterSec' in response.session).toBe(false);
    expect(session.retryAfterSec).toBeNull();
  });

  test('kind without resume handler fails as invalid_response', async () => {
    const session = sessionRecord({ kind: NO_RESUME_KIND });
    const h = harness(session);
    stubs.impl = async () => {
      throw new Error('must not run');
    };
    const response = await h.useCase.execute({ ...ACTOR, inputs: { email: 'user@spec.test' } });
    expect(response.session).toEqual({ status: 'failed', error: 'invalid_response' });
    expect(session.status).toBe('failed');
    expect(session.error).toBe('invalid_response');
  });
});
