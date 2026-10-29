import type { ConnectorPublic, MirrorPolicyPublic } from '@harnesys/contracts';
import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import { type MirrorPolicy, PAIR_CODE_TTL_MS } from '../../domain/connector/constants.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export function connectorSecretKey(connectorId: string): string {
  return `connector_telegram_${connectorId}`;
}

export function pairUrlFor(botUsername: string, code: string): string {
  return `https://t.me/${botUsername}?start=${code}`;
}

export function toPolicyPublic(policy: MirrorPolicy): MirrorPolicyPublic {
  return {
    text: policy.text,
    ask: policy.ask,
    failures: policy.failures,
    files: policy.files,
    appUserEcho: policy.appUserEcho,
  };
}

export function toConnectorPublic(rec: ConnectorRecord, threadId: string): ConnectorPublic {
  return {
    id: rec.id,
    orgId: rec.orgId,
    agentId: rec.agentId,
    provider: rec.provider,
    status: rec.status,
    botUsername: rec.botUsername,
    lastError: rec.lastError,
    threadId,
    policy: toPolicyPublic(rec.policy),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function findConnectorThread(
  threads: ThreadRepositoryPort,
  orgId: string,
  connectorId: string,
): ThreadRecord | undefined {
  return threads
    .listByOrg(orgId)
    .find((t) => t.kind === 'connector' && t.metadata.connectorId === connectorId);
}

export function pairExpiresAtIso(nowMs: number): string {
  return new Date(nowMs + PAIR_CODE_TTL_MS).toISOString();
}
