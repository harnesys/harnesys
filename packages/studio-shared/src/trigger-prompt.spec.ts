import { describe, expect, test } from 'bun:test';
import { parseTriggerTaskText, triggerTaskText } from './trigger-prompt.ts';

describe('trigger task prompt', () => {
  test('round-trips title, fields, body and instructions', () => {
    const text = triggerTaskText({
      addonId: 'harnesys.google-gmail',
      triggerId: 'gmail.message',
      label: 'New Gmail message',
      title: 'Re: <deploy> & "audit"',
      text: 'Body with </trigger> and <instructions> markers',
      fields: [
        { label: 'From', value: 'Alice <alice@example.com>' },
        { label: 'Link', value: 'Open in Gmail', href: 'https://mail.google.com/x?a=1&b=2' },
      ],
      instructions: 'Summarize the mail & reply',
    });
    const view = parseTriggerTaskText(text);
    expect(view).not.toBeNull();
    expect(view?.addonId).toBe('harnesys.google-gmail');
    expect(view?.triggerId).toBe('gmail.message');
    expect(view?.label).toBe('New Gmail message');
    expect(view?.title).toBe('Re: <deploy> & "audit"');
    expect(view?.body).toBe('Body with </trigger> and <instructions> markers');
    expect(view?.fields).toEqual([
      { label: 'From', value: 'Alice <alice@example.com>' },
      { label: 'Link', value: 'Open in Gmail', href: 'https://mail.google.com/x?a=1&b=2' },
    ]);
    expect(view?.instructions).toBe('Summarize the mail & reply');
  });

  test('falls back to the label as title', () => {
    const view = parseTriggerTaskText(
      triggerTaskText({
        addonId: 'acme.tool',
        triggerId: 'ping',
        label: 'Ping',
      }),
    );
    expect(view?.title).toBe('Ping');
    expect(view?.body).toBe('');
    expect(view?.fields).toEqual([]);
    expect(view?.instructions).toBe('');
  });

  test('parses pre-run notes appended after the trigger block', () => {
    const text = `${triggerTaskText({
      addonId: 'harnesys.webhook',
      triggerId: 'webhook.http',
      label: 'QA automations',
    })}\n\n<pre-run-failure>\nPre-run script failed (exit 3).\n</pre-run-failure>`;
    const view = parseTriggerTaskText(text);
    expect(view?.notes).toEqual([{ kind: 'failure', text: 'Pre-run script failed (exit 3).' }]);
  });

  test('rejects plain text', () => {
    expect(parseTriggerTaskText('[gmail] New mail from Alice: hello')).toBeNull();
  });
});
