import type { TelegramChatSummary, TelegramChatTarget } from 'harnesys';
import type {
  ConnectorBindingRecord,
  ConnectorRecord,
} from '../../../domain/connector/connector.ts';
import type { ConnectorRepositoryPort } from '../../../domain/connector/connector-repository.port.ts';
import type { TelegramApiPort } from '../../../domain/connector/telegram-api.port.ts';
import type { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';

export interface OrgTelegramDeps {
  connectors: ConnectorRepositoryPort;
  secrets: SecretStorePort;
  telegram: TelegramApiPort;
}

export interface ResolvedChat {
  connector: ConnectorRecord;
  binding: ConnectorBindingRecord;
  token: string;
  topicId: string | null;
}

export function telegramConnectors(deps: OrgTelegramDeps, orgId: string): ConnectorRecord[] {
  return deps.connectors.listByOrg(orgId).filter((row) => row.provider === 'telegram');
}

export function pickConnector(deps: OrgTelegramDeps, orgId: string, bot: string): ConnectorRecord {
  const all = telegramConnectors(deps, orgId);
  requireAny(all);
  const needle = bot.replace(/^@/, '').toLowerCase();
  const found = all.find(
    (row) => row.id === bot || row.botUsername.toLowerCase() === needle.toLowerCase(),
  );
  if (!found) {
    throw new Error(
      `Bot ${bot} is not connected. Connected bots: ${usernames(all)}. Add it in Settings → Connectors → Telegram.`,
    );
  }
  return found;
}

export function connectorFor(
  deps: OrgTelegramDeps,
  orgId: string,
  bot: string | undefined,
): ConnectorRecord {
  if (bot) {
    return pickConnector(deps, orgId, bot);
  }
  const all = telegramConnectors(deps, orgId);
  requireAny(all);
  if (all.length > 1) {
    throw new Error(`Choose a bot: ${usernames(all)}`);
  }
  const only = all[0];
  if (!only) {
    throw new Error('Telegram is not connected');
  }
  return only;
}

export function summaries(
  deps: OrgTelegramDeps,
  orgId: string,
  connector: ConnectorRecord,
): TelegramChatSummary[] {
  return deps.connectors
    .listBindings(orgId, connector.id)
    .map((binding) => summary(deps, orgId, connector, binding));
}

export function summary(
  deps: OrgTelegramDeps,
  orgId: string,
  connector: ConnectorRecord,
  binding: ConnectorBindingRecord,
): TelegramChatSummary {
  return {
    connectorId: connector.id,
    botUsername: connector.botUsername,
    chatId: binding.externalChatId,
    topicId: binding.externalTopicId,
    chatType: binding.chatType,
    title: binding.title,
    threadId: binding.threadId,
    agentIds: deps.connectors.listAgentIds(orgId, connector.id),
  };
}

export async function resolveTarget(
  deps: OrgTelegramDeps,
  orgId: string,
  input: TelegramChatTarget,
): Promise<ResolvedChat> {
  const connector = connectorFor(deps, orgId, input.bot);
  const token = await deps.secrets.get(orgId, connector.secretRef);
  if (!token) {
    throw new Error('The Telegram bot token is missing. Replace it in Settings → Connectors.');
  }
  const binding = await findBinding(deps, orgId, connector, token, input);
  return {
    connector,
    binding,
    token,
    topicId: input.topicId ?? binding.externalTopicId,
  };
}

async function findBinding(
  deps: OrgTelegramDeps,
  orgId: string,
  connector: ConnectorRecord,
  token: string,
  input: TelegramChatTarget,
): Promise<ConnectorBindingRecord> {
  const bindings = deps.connectors.listBindings(orgId, connector.id);
  const direct = bindings.find((row) => row.id === input.chat || row.externalChatId === input.chat);
  if (direct) {
    return direct;
  }
  const byTitle = matchByTitle(bindings, input.chat);
  if (byTitle) {
    return byTitle;
  }
  if (input.chat.startsWith('@')) {
    const info = await deps.telegram.getChat(token, input.chat);
    const byUsername = bindings.find(
      (row) =>
        row.externalChatId === info.id &&
        (input.topicId === undefined || row.externalTopicId === input.topicId),
    );
    if (byUsername) {
      return byUsername;
    }
  }
  throw new Error(
    `The bot does not know the chat "${input.chat}". Add it in Settings → Connectors → Telegram first.`,
  );
}

function requireAny(all: ConnectorRecord[]): void {
  if (all.length === 0) {
    throw new Error('Telegram is not connected. Add a bot in Settings → Connectors → Telegram.');
  }
}

function usernames(all: ConnectorRecord[]): string {
  return all.map((row) => `@${row.botUsername}`).join(', ');
}

function matchByTitle(
  bindings: ConnectorBindingRecord[],
  chat: string,
): ConnectorBindingRecord | undefined {
  const needle = chat.replace(/^@/, '').trim().toLowerCase();
  const matches = bindings.filter((row) => (row.title ?? '').trim().toLowerCase() === needle);
  if (matches.length > 1) {
    throw new Error(`Several chats are named "${chat}". Use the chat id instead.`);
  }
  return matches[0];
}
