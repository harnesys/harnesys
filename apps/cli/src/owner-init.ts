import { fail, harnesysHome, localOrigin } from './paths.ts';
import { promptLine, promptSecret } from './prompt.ts';
import { failHttp } from './session-client.ts';

export async function commandOwnerInit(): Promise<void> {
  const origin = localOrigin(harnesysHome());
  const login = (await promptLine('login: ')).trim();
  if (!login) {
    fail('login must not be empty');
  }
  const name = (await promptLine('name: ')).trim();
  if (!name) {
    fail('name must not be empty');
  }
  const password = await promptSecret('password: ');
  if (!password) {
    fail('password must not be empty');
  }
  let response: Response;
  try {
    response = await fetch(`${origin}/api/session/owner/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login, name, password }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail(`local host is not reachable at ${origin}`);
  }
  if (response.status === 409) {
    fail('owner already exists');
  }
  if (!response.ok) {
    return await failHttp('owner init failed', response);
  }
  const body = (await response.json()) as { userId?: unknown };
  process.stdout.write(`owner ${login} created at ${origin} (${String(body.userId)})\n`);
}
