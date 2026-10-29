import { fail, harnesysHome, localOrigin } from './paths.ts';
import { failHttp, fetchWithSession } from './session-client.ts';
import { readSession } from './session-store.ts';

export async function commandPromote(options: {
  orgId: string;
  accept?: boolean;
  targetNodeId?: string;
  newRelayUrl?: string;
  from?: string;
  token?: string;
}): Promise<void> {
  const home = harnesysHome();
  const session = readSession(home);
  if (!session) {
    fail('no session — run: harnesys login <relayUrl>');
  }
  const orgId = options.orgId.trim();
  if (!orgId) {
    fail('promote requires --org <orgId>');
  }
  const origin = localOrigin(home);

  if (options.accept) {
    const from = options.from?.trim();
    const promoteToken = options.token?.trim();
    if (!from || !promoteToken) {
      fail('promote accept requires --from <sourceRelayUrl> --token <promoteToken>');
    }
    let response: Response;
    try {
      response = await fetchWithSession(session, `${origin}/api/discovery/promote/accept`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          orgId,
          sourceRelayUrl: from,
          promoteToken,
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      fail(`local host is not reachable at ${origin}`);
    }
    if (!response.ok) {
      return await failHttp('promote accept failed', response);
    }
    process.stdout.write(`promote accepted — this host is now relay for ${orgId}\n`);
    return;
  }

  const targetNodeId = options.targetNodeId?.trim();
  const newRelayUrl = options.newRelayUrl?.trim();
  if (!targetNodeId || !newRelayUrl) {
    fail(
      'usage: harnesys host promote --org <id> --target-node <nodeId> --relay-url <newRelayUrl>\n' +
        '   or: harnesys host promote --org <id> --accept --from <url> --token <token>',
    );
  }
  let response: Response;
  try {
    response = await fetchWithSession(session, `${origin}/api/fleet/promote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-id': orgId,
      },
      body: JSON.stringify({ targetNodeId, newRelayUrl }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail(`local host is not reachable at ${origin}`);
  }
  if (!response.ok) {
    return await failHttp('promote start failed', response);
  }
  const body = (await response.json()) as {
    promoteToken?: unknown;
    expiresAt?: unknown;
    newRelayUrl?: unknown;
  };
  process.stdout.write(`promote token: ${String(body.promoteToken)}\n`);
  process.stdout.write(`expires at ${String(body.expiresAt)}\n`);
  process.stdout.write(
    `on target: harnesys host promote --org ${orgId} --accept --from ${origin} --token ${String(body.promoteToken)}\n`,
  );
}
