import { fail, harnesysHome, localOrigin } from './paths.ts';
import { failHttp, fetchWithSession } from './session-client.ts';
import { readSession } from './session-store.ts';

export async function commandRetarget(orgId: string, relayUrl: string): Promise<void> {
  const home = harnesysHome();
  const session = readSession(home);
  if (!session) {
    fail('no session — run: harnesys login <relayUrl>');
  }
  const cleanOrg = orgId.trim();
  const cleanUrl = relayUrl.trim().replace(/\/+$/, '');
  if (!cleanOrg || !cleanUrl) {
    fail('usage: harnesys host retarget --org <orgId> <newRelayUrl>');
  }
  const origin = localOrigin(home);
  let response: Response;
  try {
    response = await fetchWithSession(session, `${origin}/api/discovery/retarget`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ orgId: cleanOrg, relayUrl: cleanUrl }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    fail(`local host is not reachable at ${origin}`);
  }
  if (!response.ok) {
    return await failHttp('retarget failed', response);
  }
  process.stdout.write(`nodes/${cleanOrg}.json relayUrl set to ${cleanUrl}\n`);
}
