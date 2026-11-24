import type { BrowserCredential } from '@harnesys/contracts';
import { AskUserInterrupt } from '../../../domain/errors.ts';
import type { ToolContext, ToolDefinition } from '../../../ports/tools.ts';
import { tool } from '../../../ports/tools.ts';
import {
  bindCredentialedSession,
  credentialedSessionOf,
  releaseCredentialedSession,
  setPendingLoginAttempt,
  takePendingLoginAttempt,
  withLoginMutex,
} from './browser-session-registry.ts';
import type { BrowserEngineRuntime } from './browser-tools.ts';
import { BrowserLoginDeniedError, BrowserLoginFailedError } from './login-errors.ts';
import { originText, sameOrigin } from './login-origin.ts';
import type {
  BrowserLoginAuditEntry,
  BrowserLoginGrant,
  BrowserLoginPorts,
} from './login-ports.ts';
import {
  assertLoginOrigin,
  checkSuccess,
  clearPassword,
  clickPreLogin,
  currentUrl,
  ensureConnectedWithProxy,
  failureDetail,
  fillAndSubmit,
  openLoginPage,
  resetLoginBrowser,
  runWithPolicy,
  safeUrl,
} from './login-steps.ts';

export { BrowserLoginDeniedError, BrowserLoginFailedError };

const AUTH_LOGIN_TIMEOUT_MS = 120_000;
const ATTEMPT_TTL_TEXT = '10 minutes';

interface LoginScope {
  orgId: string;
  threadId: string;
}

function scopeOf(runtime: BrowserEngineRuntime): LoginScope {
  return {
    orgId: runtime.scopeKey.split(':')[0] ?? '',
    threadId: runtime.scopeKey.split(':')[1] ?? '',
  };
}

function mutexKey(runtime: BrowserEngineRuntime, credentialId: string): string {
  return `${scopeOf(runtime).orgId}:${credentialId}`;
}

function auditOf(ports: BrowserLoginPorts, entry: BrowserLoginAuditEntry): void {
  ports.audit?.(entry);
}

function authLoginArgs(
  credentialId: string,
  loginUrl: string,
  credential: BrowserCredential,
): string[] {
  return [
    'auth',
    'login',
    credentialId,
    '--credential-provider',
    'harnesys',
    '--item',
    credentialId,
    '--no-navigate',
    '--url',
    loginUrl,
    '--username-selector',
    credential.usernameSelector,
    '--password-selector',
    credential.passwordSelector,
    '--submit-selector',
    credential.submitSelector,
  ];
}

const LOGIN_TOOL_DESCRIPTION = [
  'Log the current browser session into a website with a website credential granted to this agent.',
  'Input is only { credentialId } — list ids with browser_credentials. The password stays in the vault and never enters input, output, or logs.',
  'Returns { ok, url }. On an error the code prefix decides the next step:',
  'browser_login_not_allowed — the credential is missing, locked, or not granted; tell the user, do not retry.',
  'browser_login_failed — selectors or success markers did not match; do not retry, tell the user to fix the credential.',
  'A parked run asks the user for a verification code, manual sign-in, or a session import; wait for the run to resume.',
].join(' ');

export function browserLoginTool(
  ports: BrowserLoginPorts,
  runtime: BrowserEngineRuntime,
): ToolDefinition {
  return tool('browser_login', {
    group: 'browser',
    description: LOGIN_TOOL_DESCRIPTION,
    operations: ['network'],
    sideEffect: 'credentialed',
    exposure: 'direct',
    input: {
      type: 'object',
      properties: {
        credentialId: {
          type: 'string',
          description: 'Website credential id granted to this agent (see browser_credentials)',
        },
      },
      required: ['credentialId'],
      additionalProperties: false,
    },
    gate: () => ({ decision: 'ask' }),
    async execute(raw, ctx: ToolContext) {
      const input = (raw ?? {}) as { credentialId?: string };
      const credentialId = String(input.credentialId ?? '');
      if (credentialId.length === 0) {
        throw new BrowserLoginDeniedError('', 'credentialId is required');
      }
      if (ctx.resume !== undefined && ctx.resume !== null) {
        return await withLoginMutex(mutexKey(runtime, credentialId), () =>
          resumeLogin(ports, runtime, credentialId),
        );
      }
      return await withLoginMutex(mutexKey(runtime, credentialId), () =>
        startLogin(ports, runtime, credentialId, ctx.sandbox !== true),
      );
    },
  });
}

export function browserCredentialsTool(ports: BrowserLoginPorts): ToolDefinition {
  return tool('browser_credentials', {
    group: 'browser',
    description:
      'List website logins granted to this agent: id, name, login URL, status. Use the id with browser_login. Empty means the user has not granted any website login.',
    sideEffect: 'read',
    input: { type: 'object', properties: {} },
    async execute() {
      const items = (await ports.credentialList?.()) ?? [];
      return {
        items: items.map((item) => ({
          credentialId: item.id,
          name: item.name,
          loginUrl: item.loginUrl,
          status: item.status,
        })),
      };
    },
  });
}

async function resolveGrant(
  ports: BrowserLoginPorts,
  runtime: BrowserEngineRuntime,
  credentialId: string,
): Promise<BrowserLoginGrant> {
  if (ports.credentialResolver === undefined) {
    throw new BrowserLoginDeniedError(credentialId, 'no credential resolver on this host');
  }
  const grant = await ports.credentialResolver(credentialId);
  if (grant !== null) {
    return grant;
  }
  auditOf(ports, {
    ...scopeOf(runtime),
    credentialId,
    targetOrigin: '',
    ok: false,
    denied: true,
  });
  throw new BrowserLoginDeniedError(credentialId, 'not granted, missing, or locked');
}

async function credentialForResume(
  ports: BrowserLoginPorts,
  credentialId: string,
): Promise<BrowserCredential> {
  const credential = (await ports.credentialGet?.(credentialId)) ?? null;
  if (credential === null) {
    throw new BrowserLoginDeniedError(credentialId, 'not granted, missing, or locked');
  }
  return credential;
}

async function startLogin(
  ports: BrowserLoginPorts,
  runtime: BrowserEngineRuntime,
  credentialId: string,
  canAskUser: boolean,
): Promise<{ ok: boolean; url: string }> {
  const grant = await resolveGrant(ports, runtime, credentialId);
  const credential = grant.credential;
  const targetOrigin = originText(credential.loginUrl);
  if (ports.egressProxy === undefined) {
    throw new BrowserLoginDeniedError(credentialId, 'no egress containment on this host');
  }
  const proxy = await ports.egressProxy({
    scopeKey: runtime.scopeKey,
    credentialId,
    hosts: credential.egressHosts,
  });
  if (credentialedSessionOf(runtime.scopeKey) === undefined) {
    await resetLoginBrowser(runtime);
  }
  await ensureConnectedWithProxy(runtime, proxy.port, async () => {
    releaseCredentialedSession(runtime.scopeKey);
    await proxy.stop();
  });
  bindCredentialedSession(runtime.scopeKey, {
    credentialId,
    proxyPort: proxy.port,
    hosts: credential.egressHosts,
  });
  try {
    await openLoginPage(runtime, credential.loginUrl, credentialId);
    await assertLoginOrigin(runtime, credential.loginUrl, credentialId);
    const already = await checkSuccess(runtime, credential);
    if (already.ok) {
      await ports.loginResult?.({ credentialId, ok: true, targetOrigin });
      auditOf(ports, { ...scopeOf(runtime), credentialId, targetOrigin, ok: true });
      return { ok: true, url: safeUrl(already.url) };
    }
    await clickPreLogin(runtime, credential);
    await runWithPolicy(authLoginArgs(credentialId, credential.loginUrl, credential), runtime, {
      timeoutMs: AUTH_LOGIN_TIMEOUT_MS,
      env: grant.pluginEnv,
    });
  } catch (error) {
    await resetLoginBrowser(runtime);
    throw error;
  }
  return await finishLogin(ports, runtime, credential, targetOrigin, canAskUser);
}

async function finishLogin(
  ports: BrowserLoginPorts,
  runtime: BrowserEngineRuntime,
  credential: BrowserCredential,
  targetOrigin: string,
  canAskUser: boolean,
): Promise<{ ok: boolean; url: string }> {
  const scope = scopeOf(runtime);
  const check = await checkSuccess(runtime, credential);
  if (check.ok) {
    await ports.loginResult?.({ credentialId: credential.id, ok: true, targetOrigin });
    auditOf(ports, { ...scope, credentialId: credential.id, targetOrigin, ok: true });
    return { ok: true, url: safeUrl(check.url) };
  }
  await clearPassword(runtime, credential);
  const attempts = ports.loginAttempts;
  if (attempts !== undefined && canAskUser) {
    const kind = credential.challengeCodeSelector === null ? 'manual' : 'challenge';
    const attempt = await attempts.start({ credentialId: credential.id, kind });
    setPendingLoginAttempt(runtime.scopeKey, {
      attemptId: attempt.attemptId,
      credentialId: credential.id,
    });
    auditOf(ports, {
      ...scope,
      credentialId: credential.id,
      targetOrigin,
      ok: false,
      attemptId: attempt.attemptId,
    });
    throw new AskUserInterrupt({
      prompt:
        kind === 'challenge'
          ? `Website login for "${credential.name}" is waiting for a verification code. Submit it within ${ATTEMPT_TTL_TEXT}, or type the username and password again.`
          : `Website login for "${credential.name}" did not complete at ${safeUrl(check.url)} (wrong password, a captcha, 2FA, or a multi-step form). Submit a verification code, type the username and password within ${ATTEMPT_TTL_TEXT}, or import a browser session from your own device.`,
      source: 'ask_user',
      tool: {
        name: 'browser_login',
        input: { credentialId: credential.id },
        toolCallId: '',
      },
      resumeSchema: {
        type: 'object',
        properties: { provided: { type: 'boolean' } },
        required: ['provided'],
        additionalProperties: false,
      },
    });
  }
  await ports.loginResult?.({ credentialId: credential.id, ok: false, targetOrigin });
  auditOf(ports, { ...scope, credentialId: credential.id, targetOrigin, ok: false });
  throw new BrowserLoginFailedError(credential.id, 'success markers not reached after submit');
}

async function resumeLogin(
  ports: BrowserLoginPorts,
  runtime: BrowserEngineRuntime,
  credentialId: string,
): Promise<{ ok: boolean; url: string }> {
  const pending = takePendingLoginAttempt(runtime.scopeKey);
  const attempts = ports.loginAttempts;
  if (pending === undefined || attempts === undefined) {
    throw new BrowserLoginFailedError(credentialId, 'no pending login attempt to resume');
  }
  const credential = await credentialForResume(ports, credentialId);
  const targetOrigin = originText(credential.loginUrl);
  const binding = credentialedSessionOf(runtime.scopeKey);
  if (binding === undefined || binding.credentialId !== credentialId) {
    await attempts.complete(pending.attemptId).catch(() => {});
    throw new BrowserLoginFailedError(
      credentialId,
      'the browser login session expired; ask the user to retry browser_login',
    );
  }
  await ensureConnectedWithProxy(runtime, binding.proxyPort, async () => {
    releaseCredentialedSession(runtime.scopeKey);
  });
  const liveUrl = await currentUrl(runtime);
  if (!sameOrigin(liveUrl, credential.loginUrl)) {
    await attempts.complete(pending.attemptId).catch(() => {});
    throw new BrowserLoginFailedError(
      credentialId,
      'the login page is gone from the browser session; ask the user to retry browser_login',
    );
  }
  const attemptInput = await attempts.takeInput(pending.attemptId);
  if (attemptInput === null) {
    await attempts.complete(pending.attemptId).catch(() => {});
    await ports.loginResult?.({ credentialId, ok: false, targetOrigin });
    throw new BrowserLoginFailedError(credentialId, 'challenge input expired or was not provided');
  }
  await clickPreLogin(runtime, credential);
  const submitted = await fillAndSubmit(runtime, credential, attemptInput);
  await attempts.complete(pending.attemptId).catch(() => {});
  const check = await checkSuccess(runtime, credential);
  if (!check.ok) {
    await clearPassword(runtime, credential);
    await ports.loginResult?.({ credentialId, ok: false, targetOrigin });
    const outcome = submitted.ok ? 'submitted' : `submit failed${failureDetail(submitted.output)}`;
    throw new BrowserLoginFailedError(
      credentialId,
      `success markers not reached after human input (${outcome})`,
    );
  }
  await ports.loginResult?.({ credentialId, ok: true, targetOrigin });
  return { ok: true, url: safeUrl(check.url) };
}
