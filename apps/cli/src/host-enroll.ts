import { fail, harnesysHome, localOrigin } from './paths.ts';
import { failHttp, fetchWithSession } from './session-client.ts';
import { readSession } from './session-store.ts';

export async function commandEnroll(options: {
  relayUrl: string;
  code: string;
  name: string;
  orgId: string;
}): Promise<void> {
  const home = harnesysHome();
  const session = readSession(home);
  if (!session) {
    fail('no session — run: harnesys login <relayUrl>');
  }
  const relayUrl = options.relayUrl.replace(/\/+$/, '');
  if (!/^https?:\/\//.test(relayUrl)) {
    fail(`relayUrl must start with http:// or https://, got "${options.relayUrl}"`);
  }
  const orgId = options.orgId.trim();
  if (!orgId) {
    fail('enroll requires --org <orgId>');
  }
  const origin = localOrigin(home);
  let response: Response;
  try {
    response = await fetchWithSession(session, `${origin}/api/discovery/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        relayUrl,
        inviteCode: options.code,
        nodeName: options.name,
        orgId,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    fail(`local host is not reachable at ${origin} — start it first`);
  }
  if (!response.ok) {
    return await failHttp('enroll failed', response);
  }
  const body = (await response.json()) as { nodeId?: unknown; orgId?: unknown };
  process.stdout.write(
    `enrolled as ${options.name} (${String(body.nodeId)}) for org ${String(body.orgId)}\n`,
  );
  process.stdout.write(
    `identity (node token + ticket key) written to ${home}/nodes/${orgId}.json (0600)\n`,
  );
}
