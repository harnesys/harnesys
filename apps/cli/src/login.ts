import { fail, harnesysHome } from './paths.ts';
import { promptLine, promptSecret } from './prompt.ts';
import { failHttp, refreshCookieValue } from './session-client.ts';
import { sessionPath, writeSession } from './session-store.ts';

export async function commandLogin(options: { relayUrl?: string }): Promise<void> {
  const relayUrl = (options.relayUrl ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(relayUrl)) {
    fail(
      `login requires a relayUrl starting with http:// or https://, got "${options.relayUrl ?? ''}"`,
    );
  }
  const login = (await promptLine('login: ')).trim();
  if (!login) {
    fail('login must not be empty');
  }
  const password = await promptSecret('password: ');
  if (!password) {
    fail('password must not be empty');
  }
  let response: Response;
  try {
    response = await fetch(`${relayUrl}/api/session/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login, password }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail(`relay is not reachable at ${relayUrl}`);
  }
  if (!response.ok) {
    return await failHttp('login failed', response);
  }
  const body = (await response.json()) as {
    accessToken?: unknown;
    accessExpiresAt?: unknown;
  };
  if (typeof body.accessToken !== 'string' || typeof body.accessExpiresAt !== 'string') {
    fail('unexpected login response');
  }
  const refreshToken = refreshCookieValue(response);
  if (!refreshToken) {
    fail('relay did not send the refresh cookie');
  }
  writeSession(harnesysHome(), {
    relayUrl,
    accessToken: body.accessToken,
    accessExpiresAt: body.accessExpiresAt,
    refreshToken,
  });
  process.stdout.write(`logged in as ${login} at ${relayUrl}\n`);
  process.stdout.write(
    `session saved to ${sessionPath(harnesysHome())} (access expires at ${body.accessExpiresAt})\n`,
  );
}
