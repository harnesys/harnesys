import { describe, expect, test } from 'bun:test';
import {
  type AddonManifest,
  ConfigDescriptorSchema,
  type Contribution,
  parseAddonManifest,
  ToolPackDescriptorSchema,
  TriggerDescriptorSchema,
  validateManifest,
} from '@harnesys/sdk';
import { telegramAccountTools } from './tools.ts';

const raw = await Bun.file(new URL('../addon.json', import.meta.url)).json();

const EXPECTED_EFFECTS: Record<string, 'read' | 'write' | 'destructive'> = {
  get_account: 'read',
  list_dialogs: 'read',
  list_messages: 'read',
  get_message: 'read',
  search_messages: 'read',
  get_chat: 'read',
  list_participants: 'read',
  list_topics: 'read',
  send_message: 'write',
  send_media: 'write',
  send_album: 'write',
  forward_message: 'write',
  copy_message: 'write',
  edit_message: 'write',
  delete_messages: 'write',
  pin_message: 'write',
  unpin_message: 'write',
  react: 'write',
  join_chat: 'write',
  leave_chat: 'write',
  create_topic: 'write',
  download_media: 'write',
  mark_read: 'write',
};

function contributionOf(manifest: AddonManifest, family: string): Contribution {
  const found = manifest.contributions.find((contribution) => contribution.family === family);
  if (found === undefined) {
    throw new Error(`${family} contribution is missing`);
  }
  return found;
}

describe('harnesys.telegram-account manifest', () => {
  test('keeps identity, feed surface and tool-pack in sync', () => {
    const manifest = parseAddonManifest(raw);
    expect(manifest.id).toBe('harnesys.telegram-account');
    expect(manifest.version).toBe('1.2.0');
    expect(validateManifest(raw).violations).toEqual([]);

    const permissionIds = manifest.permissions.map((permission) => permission.id);
    for (const id of [
      'worker',
      'lifecycle.resident',
      'trigger',
      'accounts.use',
      'accounts.credentials',
      'http.fetch',
      'files.read',
      'files.write',
    ]) {
      expect(permissionIds).toContain(id);
    }
    expect(manifest.connections.map((connection) => connection.id)).toEqual(['telegram-user']);

    const trigger = TriggerDescriptorSchema.parse(contributionOf(manifest, 'trigger').descriptor);
    expect(trigger.kind).toBe('telegram.feed');

    const descriptor = ToolPackDescriptorSchema.parse(
      contributionOf(manifest, 'tool-pack').descriptor,
    );
    expect(descriptor.name).toBe('telegram-account');
    expect(descriptor.connection).toBe('telegram-user');
    expect(descriptor.tools.map((tool) => tool.name).sort()).toEqual(
      Object.keys(telegramAccountTools).sort(),
    );
    const effects = Object.fromEntries(descriptor.tools.map((tool) => [tool.name, tool.effect]));
    expect(effects).toEqual(EXPECTED_EFFECTS);
  });

  test('documents every config default and cap', () => {
    const manifest = parseAddonManifest(raw);
    const config = ConfigDescriptorSchema.parse(contributionOf(manifest, 'config').descriptor);
    const defaults = Object.fromEntries(
      config.fields
        .filter((field) => field.default !== undefined)
        .map((field) => [field.key, field.default]),
    );
    expect(defaults).toMatchObject({
      poll_sec: 120,
      backfill: 0,
      read_only: false,
      join_allowed: true,
      min_send_interval_ms: 2000,
      max_sends_per_hour: 20,
      max_sends_per_day: 150,
      max_history_limit: 100,
      max_dialogs: 200,
      max_upload_mb: 20,
      max_download_mb: 20,
      flood_wait_retries: 0,
    });
    expect(config.fields.map((field) => field.key)).toContain('allowed_chats');
  });
});
