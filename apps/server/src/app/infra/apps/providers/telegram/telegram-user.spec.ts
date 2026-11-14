import { describe, expect, test } from 'bun:test';
import { ProviderError } from '../../../../domain/apps/errors.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  ConnectStep,
  FormLaunch,
} from '../../../../domain/apps/provider-module.ts';
import type { JsonObject } from '../../../../domain/apps/records.ts';
import { telegramAppKind, telegramUserKind } from './mtproto-kind.ts';
import {
  API_HASH,
  API_ID,
  appVerifyCtx,
  EXPORTED_SESSION,
  FakeMtprotoPort,
  PHONE,
  PROFILE,
  resumeCtx,
  STATIC_SESSION,
  startCtx,
  verifyCtx,
} from './telegram-user.spec-fakes.ts';

interface WaitStep {
  type: 'wait';
  launch: FormLaunch;
  state: JsonObject;
  ttlSec: number;
}

function waitOf(step: ConnectStep<AccountConnectResult>): WaitStep {
  if (step.type !== 'wait' || step.launch.kind !== 'form') {
    throw new Error('expected a wait step with a form launch');
  }
  return {
    type: 'wait',
    launch: step.launch,
    state: step.state,
    ttlSec: step.ttlSec,
  };
}

function requireResume(): NonNullable<typeof telegramUserKind.connect.resume> {
  const resume = telegramUserKind.connect.resume;
  if (!resume) {
    throw new Error('resume required for the spec');
  }
  return resume;
}

describe('telegram-user connect', () => {
  test('start sends the code, exports the session and waits for the login code', async () => {
    const port = new FakeMtprotoPort({ sendCodeHash: 'hash-of-code' });
    const wait = waitOf(await telegramUserKind.connect.start(startCtx(port)));
    const client = port.clients.at(-1);
    expect(client?.connected).toBe(true);
    expect(client?.closed).toBe(true);
    expect(client?.access).toEqual({ apiId: API_ID, apiHash: API_HASH });
    expect(wait.ttlSec).toBe(600);
    expect(wait.state).toEqual({
      phone: PHONE,
      phoneCodeHash: 'hash-of-code',
      session: EXPORTED_SESSION,
    });
    expect(wait.launch.text).toBe('Enter the login code Telegram sent you');
    expect(wait.launch.fields.map((field) => field.key)).toEqual(['code']);
    expect(wait.launch.fields[0]?.label).toBe('Login code');
    expect(wait.launch.fields[0]?.type).toBe('text');
    expect(wait.launch.fields[0]?.required).toBe(true);
    expect(wait.launch.fields[0]?.help).toBe(`Sent to the Telegram app for ${PHONE}`);
  });

  test('a rejected code waits again with the same state', async () => {
    const port = new FakeMtprotoPort({
      signIn: () => Promise.reject(new ProviderError('invalid_input')),
    });
    const state: JsonObject = {
      phone: PHONE,
      phoneCodeHash: 'hash-of-code',
      session: STATIC_SESSION,
    };
    const wait = waitOf(await requireResume()(resumeCtx(port, state, { code: '1111' })));
    expect(wait.state).toEqual(state);
    expect(wait.launch.text).toBe('The code is rejected or has expired — try again');
    expect(wait.launch.fields.map((field) => field.key)).toEqual(['code']);
    expect(port.clients.at(-1)?.closed).toBe(true);
  });

  test('a rejected password waits again with the password form', async () => {
    const port = new FakeMtprotoPort({
      signInWithPassword: () => Promise.reject(new ProviderError('invalid_input')),
    });
    const state: JsonObject = {
      phone: PHONE,
      phoneCodeHash: 'hash-of-code',
      session: STATIC_SESSION,
    };
    const wait = waitOf(await requireResume()(resumeCtx(port, state, { password: 'pw' })));
    expect(wait.state).toEqual(state);
    expect(wait.launch.text).toBe('The password is rejected — try again');
    expect(wait.launch.fields.map((field) => field.key)).toEqual(['password']);
  });

  test('a two-factor account waits with the refreshed session and the password form', async () => {
    const port = new FakeMtprotoPort({
      signIn: { status: 'needsPassword' },
      exported: 'pw-session',
    });
    const state: JsonObject = {
      phone: PHONE,
      phoneCodeHash: 'hash-of-code',
      session: STATIC_SESSION,
    };
    const wait = waitOf(await requireResume()(resumeCtx(port, state, { code: '1111' })));
    expect(wait.launch.text).toBe('Enter the two-factor password for the Telegram account');
    expect(wait.launch.fields.map((field) => field.key)).toEqual(['password']);
    expect(wait.state.session).toBe('pw-session');
    expect(wait.state.phone).toBe(PHONE);
    expect(port.clients.at(-1)?.closed).toBe(true);
  });

  test('a completed sign-in yields the session secret and the profile identity', async () => {
    const port = new FakeMtprotoPort({ signIn: { status: 'done', profile: PROFILE } });
    const state: JsonObject = {
      phone: PHONE,
      phoneCodeHash: 'hash-of-code',
      session: STATIC_SESSION,
    };
    const step = await requireResume()(resumeCtx(port, state, { code: '1111' }));
    if (step.type !== 'done') {
      throw new Error('expected a done step');
    }
    const result = step.result;
    expect(result.externalAccountId).toBe('9001');
    expect(result.label).toBe('First Last handle');
    expect(result.scopes).toEqual([]);
    expect(result.secrets).toEqual({ session: EXPORTED_SESSION });
    expect(result.expiresAt).toBeNull();
    expect(result.metadata).toEqual({ firstName: 'First', lastName: 'Last', username: 'handle' });
  });

  test('non-retry provider errors fail the session', async () => {
    const flood = new ProviderError('rate_limited', { retryAfterSec: 30 });
    const port = new FakeMtprotoPort({ signIn: () => Promise.reject(flood) });
    const state: JsonObject = {
      phone: PHONE,
      phoneCodeHash: 'hash-of-code',
      session: STATIC_SESSION,
    };
    let thrown: unknown = null;
    try {
      await requireResume()(resumeCtx(port, state, { code: '1111' }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(flood);
  });
});

describe('telegram kinds verify', () => {
  test('the app kind probes apiId and apiHash', async () => {
    const port = new FakeMtprotoPort({ probe: 2 });
    await telegramAppKind.verify?.(appVerifyCtx(port));
    expect(port.probeCalls).toEqual([{ apiId: API_ID, apiHash: API_HASH }]);
  });

  test('the user kind probes the stored session and returns the profile identity', async () => {
    const port = new FakeMtprotoPort({ probeProfile: PROFILE });
    const result = await telegramUserKind.verify(verifyCtx(port));
    expect(result.identity).toEqual({ externalAccountId: '9001', label: 'First Last handle' });
    expect(result.metadata).toEqual({ firstName: 'First', lastName: 'Last', username: 'handle' });
    expect(port.probeSessionCalls).toEqual([
      { apiId: API_ID, apiHash: API_HASH, session: STATIC_SESSION },
    ]);
  });

  test('descriptors request the app and keep access on the stored session', () => {
    const user: AccountKindModule = telegramUserKind;
    expect(user.descriptor.kind).toBe('telegram-user');
    expect(user.descriptor.requiresApp).toEqual(['telegram-app']);
    expect(user.descriptor.access).toEqual({ source: 'stored', keys: ['session'] });
    expect(user.descriptor.endpoints).toEqual([]);
    expect(user.revoke).toBeUndefined();
    expect(user.webhook).toBeUndefined();
    const app: AppKindModule = telegramAppKind;
    expect(app.descriptor.kind).toBe('telegram-app');
    expect(app.setup).toBeUndefined();
    expect(app.webhook).toBeUndefined();
    expect(app.descriptor.endpoints).toEqual([]);
    expect(app.secrets).toEqual(['apiHash']);
  });
});
