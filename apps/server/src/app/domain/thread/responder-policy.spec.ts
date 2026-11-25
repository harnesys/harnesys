import { describe, expect, it } from 'bun:test';
import { resolveMentionedAgentIds, resolveResponders } from './responder-policy.ts';

const members = [
  { id: 'a1', name: 'Atlas' },
  { id: 'a2', name: 'Beacon' },
];

describe('resolveResponders', () => {
  it('falls back to the auto-reply agent when nothing is addressed', () => {
    expect(
      resolveResponders({ text: 'hello', members, autoReplyAgentId: 'a2', allowMentions: true }),
    ).toEqual(['a2']);
  });

  it('routes mentions to members only, in mention order', () => {
    expect(
      resolveResponders({
        text: '@Beacon look, then @Atlas',
        members,
        autoReplyAgentId: 'a1',
        allowMentions: true,
      }),
    ).toEqual(['a2', 'a1']);
  });

  it('ignores mentions when gating is off and keeps an explicit target', () => {
    expect(
      resolveResponders({
        text: '@Beacon',
        explicitAgentId: 'a1',
        members,
        autoReplyAgentId: 'a2',
        allowMentions: false,
      }),
    ).toEqual(['a1']);
  });

  it('matches names with spaces and non-latin letters by slug', () => {
    const named = [
      { id: 'a1', name: 'Research Lead' },
      { id: 'a2', name: 'Кодер' },
    ];
    expect(resolveResponders({ text: '@research-lead and @кодер', members: named })).toEqual([
      'a1',
      'a2',
    ]);
  });

  it('returns no responders without a mention, a target, or an auto-reply', () => {
    expect(resolveResponders({ text: 'hello', members, autoReplyAgentId: null })).toEqual([]);
  });

  it('skips the auto-reply fallback in mention mode', () => {
    expect(
      resolveResponders({
        text: 'hello',
        members,
        autoReplyAgentId: 'a2',
        allowMentions: true,
        autoFallback: false,
      }),
    ).toEqual([]);
  });

  it('still routes explicit mentions in mention mode', () => {
    expect(
      resolveResponders({
        text: '@Atlas ping',
        members,
        autoReplyAgentId: 'a2',
        allowMentions: true,
        autoFallback: false,
      }),
    ).toEqual(['a1']);
  });

  it('ignores mentions inside fenced and inline code', () => {
    const text = [
      'Look at this:',
      '```ts',
      'const ping = "@Beacon";',
      '```',
      '`@Atlas` is an example, not a ping.',
      'Real ping: @Beacon',
    ].join('\n');
    expect(resolveResponders({ text, members })).toEqual(['a2']);
  });
});

describe('resolveMentionedAgentIds', () => {
  it('returns member ids in mention order without duplicates', () => {
    expect(resolveMentionedAgentIds('@Beacon then @Atlas and @beacon', members)).toEqual([
      'a2',
      'a1',
    ]);
  });

  it('returns nothing for unknown or code-only mentions', () => {
    expect(resolveMentionedAgentIds('`@Atlas` @Nobody', members)).toEqual([]);
  });
});
