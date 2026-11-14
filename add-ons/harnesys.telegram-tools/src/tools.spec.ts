import { describe, expect, test } from 'bun:test';
import { parseAddonManifest } from '@harnesys/sdk';
import { createFakeHost, type FakeAccount, type FakeHttpRequest } from '@harnesys/sdk/testing';
import { addon } from './index.ts';
import { telegramTools } from './tools.ts';

const manifest = parseAddonManifest(
  await Bun.file(new URL('../addon.json', import.meta.url)).json(),
);

function fakeHost(
  config: Record<string, unknown>,
  handler?: (request: FakeHttpRequest) => { status: number; body: string },
  accounts: FakeAccount[] = [
    {
      connection: 'telegram-bot',
      accountId: 'acc-1',
      label: 'Sales bot',
      externalAccountId: '111',
      credentials: { botToken: '123:abc' },
    },
  ],
) {
  const requests: FakeHttpRequest[] = [];
  const host = createFakeHost({
    definition: addon,
    manifest,
    config,
    accounts,
    grants: [
      { id: 'http.fetch', scope: { hosts: ['api.telegram.org'] } },
      { id: 'accounts.use', scope: { connections: ['telegram-bot'] } },
    ],
    http: (request) => {
      requests.push(request);
      if (handler !== undefined) {
        return handler(request);
      }
      return { status: 200, body: JSON.stringify({ ok: true, result: { message_id: 42 } }) };
    },
  });
  return { host, requests };
}

describe('harnesys.telegram-tools manifest', () => {
  test('registers every handler as a tool descriptor', () => {
    const pack = manifest.contributions.find((entry) => entry.family === 'tool-pack');
    if (pack === undefined) {
      throw new Error('tool-pack contribution is missing');
    }
    const names = (pack.descriptor as { tools: Array<{ name: string }> }).tools
      .map((tool) => tool.name)
      .toSorted();
    expect(names).toEqual(Object.keys(telegramTools).toSorted());
  });

  test('declares the access settings', () => {
    const config = manifest.contributions.find((entry) => entry.family === 'config');
    if (config === undefined) {
      throw new Error('config contribution is missing');
    }
    const keys = (config.descriptor as { fields: Array<{ key: string }> }).fields.map(
      (field) => field.key,
    );
    expect(keys).toEqual(['default_chat', 'allowed_chats', 'read_only', 'bots']);
  });
});

describe('several bots', () => {
  const twoBots: FakeAccount[] = [
    {
      connection: 'telegram-bot',
      accountId: 'acc-sales',
      label: 'Sales bot',
      externalAccountId: '111',
      credentials: { botToken: '111:abc' },
    },
    {
      connection: 'telegram-bot',
      accountId: 'acc-ops',
      label: '@ops_bot',
      externalAccountId: '222',
      credentials: { botToken: '222:abc' },
    },
  ];

  test('asks for a bot when several are connected', async () => {
    const { host } = fakeHost({}, undefined, twoBots);
    await expect(
      host.callTool('telegram', 'send_message', { chat: '-100123', text: 'hi' }),
    ).rejects.toMatchObject({ reason: 'invalid_params' });
  });

  test('lists each bot with its own rights', async () => {
    const { host } = fakeHost(
      {
        read_only: false,
        allowed_chats: '@shared',
        bots: '{"@ops_bot": {"read_only": true, "allowed_chats": ["@ops"], "default_chat": "@ops"}}',
      },
      undefined,
      twoBots,
    );
    const result = await host.callTool('telegram', 'list_bots', {});
    const bots = (result.output as { bots: Array<Record<string, unknown>> }).bots;
    expect(bots[0]).toMatchObject({
      bot: 'acc-sales',
      label: 'Sales bot',
      readOnly: false,
      allowedChats: ['@shared'],
    });
    expect(bots[1]).toMatchObject({
      bot: 'acc-ops',
      label: '@ops_bot',
      readOnly: true,
      defaultChat: '@ops',
      allowedChats: ['@ops'],
    });
  });

  test('applies the per-bot rule and authenticates as the selected bot', async () => {
    const { host, requests } = fakeHost(
      {
        bots: '{"@ops_bot": {"read_only": true, "default_chat": "@ops", "allowed_chats": ["@ops"]}}',
      },
      undefined,
      twoBots,
    );
    await expect(
      host.callTool('telegram', 'send_message', { bot: '@ops_bot', text: 'hi' }),
    ).rejects.toMatchObject({ reason: 'permission_denied' });
    const sent = await host.callTool('telegram', 'send_message', {
      bot: 'acc-sales',
      chat: '-100123',
      text: 'hi',
    });
    expect(sent.output).toMatchObject({ bot: 'Sales bot', chat: '-100123' });
    expect(requests.at(-1)?.auth).toMatchObject({ accountId: 'acc-sales' });
  });
});

describe('telegram tools', () => {
  test('sends into the default chat when chat is omitted', async () => {
    const { host, requests } = fakeHost({ default_chat: '-100123' });
    const result = await host.callTool('telegram', 'send_message', { text: 'hi' });
    expect(result.output).toEqual({ messageId: '42', bot: 'Sales bot', chat: '-100123' });
    const request = requests[0];
    expect(request?.url).toEndWith('/sendMessage');
    expect(JSON.parse(request?.body ?? '{}')).toMatchObject({ chat_id: '-100123', text: 'hi' });
  });

  test('rejects a chat outside the allow-list', async () => {
    const { host } = fakeHost({ allowed_chats: '@ops' });
    await expect(
      host.callTool('telegram', 'send_message', { chat: '@other', text: 'hi' }),
    ).rejects.toMatchObject({ reason: 'permission_denied' });
  });

  test('read-only blocks writes but keeps reads', async () => {
    const { host } = fakeHost({ read_only: true, default_chat: '-100123' }, () => ({
      status: 200,
      body: JSON.stringify({ ok: true, result: { id: -100123, type: 'supergroup', title: 'Ops' } }),
    }));
    await expect(host.callTool('telegram', 'send_message', { text: 'hi' })).rejects.toMatchObject({
      reason: 'permission_denied',
    });
    const result = await host.callTool('telegram', 'get_chat', {});
    expect(result.output).toMatchObject({ id: -100123, title: 'Ops' });
  });

  test('lists the configured chats with their kind', async () => {
    const { host } = fakeHost(
      { default_chat: '-100123', allowed_chats: '@ops, -100999' },
      (request) => {
        const chatId = JSON.parse(request.body ?? '{}').chat_id as string;
        const byChat: Record<string, Record<string, unknown>> = {
          '@ops': { id: -100999, type: 'channel', username: 'ops' },
          '-100999': { id: -100999, type: 'supergroup', title: 'Team' },
          '-100123': { id: -100123, type: 'supergroup', title: 'Ops' },
        };
        const result = byChat[chatId] ?? { id: 0, type: 'private' };
        return { status: 200, body: JSON.stringify({ ok: true, result }) };
      },
    );
    const result = await host.callTool('telegram', 'list_chats', {});
    expect(result.output).toMatchObject({ restricted: true, truncated: false });
    const chats = (result.output as { chats: Array<Record<string, unknown>> }).chats;
    expect(chats).toHaveLength(3);
    expect(chats[0]).toMatchObject({ chat: '-100123', title: 'Ops', default: true });
    expect(chats[1]).toMatchObject({ chat: '@ops', type: 'channel', username: 'ops' });
    expect(chats[2]).toMatchObject({ chat: '-100999', title: 'Team', default: false });
  });

  test('explains an empty chat configuration', async () => {
    const { host } = fakeHost({});
    const result = await host.callTool('telegram', 'list_chats', {});
    expect(result.output).toMatchObject({ chats: [], restricted: false });
    expect(JSON.stringify(result.output)).toContain('no chats are configured');
  });

  test('accepts the numeric id of a chat allow-listed by username', async () => {
    const { host, requests } = fakeHost({ allowed_chats: '@harnesys_test_channel' }, (request) => {
      const body = JSON.parse(request.body ?? '{}') as { chat_id?: string; text?: string };
      if (body.text === undefined) {
        return {
          status: 200,
          body: JSON.stringify({
            ok: true,
            result: { id: -1003938033532, type: 'channel', username: 'harnesys_test_channel' },
          }),
        };
      }
      return { status: 200, body: JSON.stringify({ ok: true, result: { message_id: 7 } }) };
    });
    const result = await host.callTool('telegram', 'send_message', {
      chat: '-1003938033532',
      text: 'hi',
    });
    expect(result.output).toMatchObject({ messageId: '7', chat: '-1003938033532' });
    expect(requests.map((request) => request.url.split('/').pop())).toEqual([
      'getChat',
      'sendMessage',
    ]);
  });

  test('surfaces the Telegram category instead of a bare description', async () => {
    const { host } = fakeHost({ default_chat: '@ops' }, () => ({
      status: 400,
      body: JSON.stringify({
        ok: false,
        error_code: 400,
        description: 'Bad Request: chat not found',
      }),
    }));
    await expect(host.callTool('telegram', 'send_message', { text: 'hi' })).rejects.toMatchObject({
      reason: 'not_found',
    });
  });
});
