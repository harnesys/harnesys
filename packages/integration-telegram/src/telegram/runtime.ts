import type { IntegrationContext } from 'harnesys/integration';
import type { LoginSessions } from '../auth/login-sessions.ts';
import { findReader } from '../db/store.ts';
import { type ClientHandle, type FeedCredentials, loginClient, openClient } from './client.ts';

const handles = new Map<string, ClientHandle>();

export function handleKey(orgId: string, readerId: string): string {
  return `${orgId}:${readerId}`;
}

export async function getHandle(
  ctx: IntegrationContext,
  _sessions: LoginSessions,
  readerId: string,
): Promise<ClientHandle> {
  const key = handleKey(ctx.orgId, readerId);
  const cached = handles.get(key);
  if (cached) {
    return cached;
  }
  const reader = findReader(ctx.db, readerId);
  if (!reader) {
    throw new Error(`Feed reader ${readerId} not found`);
  }
  const session = await ctx.secrets.get(`reader:${readerId}:session`);
  if (!session) {
    throw new Error(`Feed reader ${readerId} has no stored session`);
  }
  const handle = await openClient(await credentialsOf(ctx, readerId, reader.apiId), session);
  handles.set(key, handle);
  return handle;
}

export async function startLogin(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  creds: FeedCredentials,
  readerId: string,
  phone: string,
  onPrompt?: (kind: 'code' | 'password') => void,
): Promise<ClientHandle> {
  const handle = await loginClient(creds, phone, sessions, readerId, onPrompt);
  handles.set(handleKey(ctx.orgId, readerId), handle);
  return handle;
}

export async function dropHandle(ctx: IntegrationContext, readerId: string): Promise<void> {
  const key = handleKey(ctx.orgId, readerId);
  const handle = handles.get(key);
  if (!handle) {
    return;
  }
  handles.delete(key);
  await handle.close();
}

export async function joinInvite(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  readerId: string,
  invite: string,
): Promise<void> {
  const handle = await getHandle(ctx, sessions, readerId);
  await handle.joinInvite(invite);
}

export async function credentialsOf(
  ctx: IntegrationContext,
  readerId: string,
  apiId: number,
): Promise<FeedCredentials> {
  const apiHash = await ctx.secrets.get(`reader:${readerId}:api_hash`);
  if (!apiHash) {
    throw new Error(`Feed reader ${readerId} has no stored api hash`);
  }
  return { apiId, apiHash };
}

export function cachedHandle(ctx: IntegrationContext, readerId: string): ClientHandle | undefined {
  return handles.get(handleKey(ctx.orgId, readerId));
}
