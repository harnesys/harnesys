import { fail, harnesysHome, localOrigin } from './paths.ts';
import { failHttp, fetchWithSession } from './session-client.ts';
import { readSession } from './session-store.ts';

export async function commandInvite(options: {
  name: string;
  orgId: string;
  ttlMin?: number;
}): Promise<void> {
  const home = harnesysHome();
  const session = readSession(home);
  if (!session) {
    fail('no session — run: harnesys login <relayUrl>');
  }
  const orgId = options.orgId.trim();
  if (!orgId) {
    fail('invite requires --org <orgId>');
  }
  const origin = localOrigin(home);
  let response: Response;
  try {
    response = await fetchWithSession(session, `${origin}/api/fleet/invites`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-id': orgId,
      },
      body: JSON.stringify({ nodeName: options.name, ttlMin: options.ttlMin }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    fail(`host is not reachable at ${origin}`);
  }
  if (!response.ok) {
    return await failHttp('invite failed', response);
  }
  const body = (await response.json()) as {
    code?: unknown;
    expiresAt?: unknown;
    relayUrlHint?: unknown;
  };
  if (typeof body.code !== 'string' || typeof body.expiresAt !== 'string') {
    fail(`unexpected invite response: ${JSON.stringify(body).slice(0, 120)}`);
  }
  const hint =
    typeof body.relayUrlHint === 'string' && body.relayUrlHint ? body.relayUrlHint : origin;
  process.stdout.write(`invite code: ${body.code}\n`);
  process.stdout.write(`expires at ${body.expiresAt}\n`);
  process.stdout.write(
    `worker: harnesys host enroll ${hint} ${body.code} --name ${options.name} --org ${orgId}\n`,
  );
}
