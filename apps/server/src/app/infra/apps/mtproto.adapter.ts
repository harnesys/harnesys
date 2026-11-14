import { Injectable } from '@harnesys/brix';
import * as telegram from 'teleproto';
import { computeCheck } from 'teleproto/Password';
import { StringSession } from 'teleproto/sessions';
import { ProviderError } from '../../domain/apps/errors.ts';
import {
  type MtprotoApiAccess,
  type MtprotoClient,
  MtprotoLoginPort,
  type MtprotoPhoneCode,
  type MtprotoSignInOutcome,
  type MtprotoUserProfile,
} from '../../domain/apps/mtproto-port.ts';

export type MtprotoFailureFamily = 'flood' | 'bad_request' | 'unauthorized' | 'unclassified';

const SESSION_CODES = [
  'AUTH_KEY',
  'AUTHORIZED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'SESSION_PROTECTED',
];

export function mtprotoFailure(
  family: MtprotoFailureFamily,
  text: string,
  seconds?: number,
): ProviderError {
  if (family === 'flood') {
    const retryAfterSec = Number.isInteger(seconds) && (seconds ?? 0) > 0 ? seconds : undefined;
    return new ProviderError(
      'rate_limited',
      retryAfterSec === undefined ? undefined : { retryAfterSec },
    );
  }
  const upper = text.toUpperCase();
  if (family === 'unauthorized' || SESSION_CODES.some((code) => upper.startsWith(code))) {
    return new ProviderError('invalid_credentials');
  }
  if (family === 'bad_request') {
    return new ProviderError('invalid_input');
  }
  return new ProviderError('invalid_response');
}

@Injectable()
export class TeleprotoMtprotoAdapter extends MtprotoLoginPort {
  override client(api: MtprotoApiAccess): MtprotoClient {
    return new TeleprotoClient(api);
  }

  override async probe(apiId: number, apiHash: string): Promise<number> {
    const client = new TeleprotoClient({ apiId, apiHash });
    try {
      await client.connect();
      return await client.nearestDc();
    } finally {
      await client.close();
    }
  }

  override async probeSession(api: MtprotoApiAccess): Promise<MtprotoUserProfile> {
    const client = new TeleprotoClient(api);
    try {
      await client.connect();
      return await client.me();
    } finally {
      await client.close();
    }
  }
}

class TeleprotoClient implements MtprotoClient {
  private readonly session: StringSession;
  private readonly client: telegram.TelegramClient;

  constructor(private readonly access: MtprotoApiAccess) {
    this.session = new StringSession(access.session ?? '');
    this.client = new telegram.TelegramClient(this.session, access.apiId, access.apiHash, {});
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async nearestDc(): Promise<number> {
    const nearest = await this.client.invoke(new telegram.Api.help.GetNearestDc());
    return Number(nearest.nearestDc);
  }

  async sendCode(phone: string): Promise<MtprotoPhoneCode> {
    try {
      const sent = await this.client.invoke(
        new telegram.Api.auth.SendCode({
          phoneNumber: phone,
          apiId: this.access.apiId,
          apiHash: this.access.apiHash,
          settings: new telegram.Api.CodeSettings({}),
        }),
      );
      if (sent.className !== 'auth.SentCode') {
        throw new ProviderError('invalid_response');
      }
      return { phoneCodeHash: sent.phoneCodeHash };
    } catch (error) {
      throw this.toProviderError(error);
    }
  }

  async signIn(phone: string, phoneCodeHash: string, code: string): Promise<MtprotoSignInOutcome> {
    try {
      await this.client.invoke(
        new telegram.Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code,
        }),
      );
      return { status: 'done', profile: await this.me() };
    } catch (error) {
      if (error instanceof telegram.errors.SessionPasswordNeededError) {
        return { status: 'needsPassword' };
      }
      throw this.toProviderError(error);
    }
  }

  async signInWithPassword(password: string): Promise<MtprotoSignInOutcome> {
    try {
      const settings = await this.client.invoke(new telegram.Api.account.GetPassword());
      if (settings.className !== 'account.Password') {
        throw new ProviderError('invalid_response');
      }
      const check = await computeCheck(settings, password);
      await this.client.invoke(new telegram.Api.auth.CheckPassword({ password: check }));
      return { status: 'done', profile: await this.me() };
    } catch (error) {
      if (error instanceof telegram.errors.SessionPasswordNeededError) {
        return { status: 'needsPassword' };
      }
      throw this.toProviderError(error);
    }
  }

  async me(): Promise<MtprotoUserProfile> {
    const users = await this.client.invoke(
      new telegram.Api.users.GetUsers({ id: [new telegram.Api.InputUserSelf()] }),
    );
    const first = Array.isArray(users) ? users.at(0) : null;
    return toProfile(first ?? users);
  }

  async exportSessionString(): Promise<string> {
    return this.session.save();
  }

  async close(): Promise<void> {
    await this.client.disconnect();
  }

  private toProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }
    if (error instanceof telegram.errors.FloodError) {
      return mtprotoFailure('flood', '', floodSeconds(error));
    }
    if (error instanceof telegram.errors.UnauthorizedError) {
      return mtprotoFailure('unauthorized', errorMessage(error));
    }
    if (error instanceof telegram.errors.BadRequestError) {
      return mtprotoFailure('bad_request', errorMessage(error));
    }
    return mtprotoFailure('unclassified', errorMessage(error));
  }
}

function toProfile(value: unknown): MtprotoUserProfile {
  if (!isUserLike(value) || (value.id === null && value.id === undefined)) {
    throw new ProviderError('invalid_response');
  }
  return {
    userId: String(value.id),
    firstName: nullableText(value.firstName),
    lastName: nullableText(value.lastName),
    username: nullableText(value.username),
  };
}

function floodSeconds(error: unknown): number | undefined {
  const seconds = isRecord(error) ? (error as { seconds?: unknown }).seconds : null;
  const value = typeof seconds === 'number' ? seconds : Number(seconds ?? Number.NaN);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function nullableText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUserLike(value: unknown): value is UserLike {
  return typeof value === 'object' && value !== null;
}

interface UserLike {
  id: unknown;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}
