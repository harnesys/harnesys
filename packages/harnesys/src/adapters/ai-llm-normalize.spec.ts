import { describe, expect, test } from 'bun:test';
import { hoistEmbeddedSchemaDefs, normalizeToolSequence } from './ai-llm-normalize.ts';

type Rec = Record<string, unknown>;

const call = (id: string, name = 'shell'): Rec => ({
  role: 'assistant',
  content: [{ type: 'tool-call', toolCallId: id, toolName: name, input: {} }],
});
const result = (id: string, name = 'shell'): Rec => ({
  role: 'tool',
  content: [
    { type: 'tool-result', toolCallId: id, toolName: name, output: { type: 'text', value: 'ok' } },
  ],
});
const user = (text = 'hi'): Rec => ({ role: 'user', content: text });

const idsOf = (messages: Rec[]): string[] =>
  messages.flatMap((m) =>
    Array.isArray(m.content)
      ? (m.content as Rec[])
          .filter((p) => p.type === 'tool-result')
          .map((p) => String(p.toolCallId))
      : [],
  );
const firstMessage = (messages: Rec[], index: number): Rec => {
  const message = messages[index];
  if (!message) {
    throw new Error(`missing message at ${index}`);
  }
  return message;
};

describe('normalizeToolSequence', () => {
  test('clean history passes through untouched with empty report', () => {
    const history = [user(), call('a'), result('a'), { role: 'assistant', content: 'done' }];
    const { messages, report } = normalizeToolSequence(history as never[]);
    expect(messages).toEqual(history);
    expect(report).toEqual({});
  });

  test('leading orphan tool result is dropped (compaction summary window)', () => {
    const head = [result('a'), user('summarize this')];
    const { messages, report } = normalizeToolSequence(head as never[]);
    expect(messages).toEqual([user('summarize this')]);
    expect(report.droppedOrphanIds).toEqual(['a']);
  });

  test('duplicate result keeps the last occurrence', () => {
    const stale = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'a',
          toolName: 'shell',
          output: { type: 'text', value: 'interrupted' },
        },
      ],
    };
    const { messages, report } = normalizeToolSequence([call('a'), stale, result('a')] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['a']);
    const parts = firstMessage(messages as Rec[], 1).content as Rec[];
    const value = (parts[0]?.output ?? {}) as { value: string };
    expect(value.value).toBe('ok');
    expect(report.droppedDuplicateIds).toEqual(['a']);
  });

  test('unanswered call gets a synthetic result right after the assistant block', () => {
    const { messages, report } = normalizeToolSequence([
      call('a'),
      result('a'),
      call('b', 'write'),
      user(),
    ] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['a', 'b']);
    expect(report.insertedCallIds).toEqual(['b']);
    expect(firstMessage(messages as Rec[], 3).role).toBe('tool');
    expect(firstMessage(messages as Rec[], 4).role).toBe('user');
  });

  test('misplaced end-of-array synthetic is dropped and a fresh adjacent one is inserted', () => {
    const misplaced = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'a',
          toolName: 'shell',
          output: { type: 'text', value: 'interrupted' },
        },
      ],
    };
    const { messages, report } = normalizeToolSequence([
      call('a'),
      user('media note'),
      { role: 'assistant', content: 'text' },
      misplaced,
    ] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['a']);
    expect(report.droppedOrphanIds).toEqual(['a']);
    expect(report.insertedCallIds).toEqual(['a']);
    expect(firstMessage(messages as Rec[], 1).role).toBe('tool');
    expect(firstMessage(messages as Rec[], 2).role).toBe('user');
  });

  test('parallel calls keep declared order in inserted synthetics', () => {
    const both = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: 'x', toolName: 'a', input: {} },
        { type: 'tool-call', toolCallId: 'y', toolName: 'b', input: {} },
      ],
    };
    const { messages, report } = normalizeToolSequence([both, user()] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['x', 'y']);
    expect(report.insertedCallIds).toEqual(['x', 'y']);
  });

  test('user message inside an open block is held until the block closes', () => {
    const both = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: 'x', toolName: 'a', input: {} },
        { type: 'tool-call', toolCallId: 'y', toolName: 'b', input: {} },
      ],
    };
    const { messages, report } = normalizeToolSequence([
      both,
      result('x'),
      user('first media'),
      result('y'),
      user('second note'),
    ] as never[]);
    expect(messages.map((m) => m.role)).toEqual(['assistant', 'tool', 'tool', 'user', 'user']);
    expect(firstMessage(messages as Rec[], 3).content).toBe('first media');
    expect(firstMessage(messages as Rec[], 4).content).toBe('second note');
    expect(report.heldUserMessages).toBe(2);
  });

  test('held user is released after the synthetic flush of an unfinished block', () => {
    const { messages, report } = normalizeToolSequence([call('a'), user('media note')] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['a']);
    expect(firstMessage(messages as Rec[], 1).role).toBe('tool');
    expect(firstMessage(messages as Rec[], 2).role).toBe('user');
    expect(report.insertedCallIds).toEqual(['a']);
    expect(report.heldUserMessages).toBe(1);
  });

  test('answered block does not hold user messages', () => {
    const history = [call('a'), result('a'), user('note')];
    const { messages, report } = normalizeToolSequence(history as never[]);
    expect(messages).toEqual(history);
    expect(report).toEqual({});
  });
});

const contractDoc = (id: string, defName: string): Rec => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `urn:harnesys:contracts:dashboards:${id}`,
  type: 'object',
  properties: {
    value: { $ref: `#/$defs/${defName}` },
    nested: { oneOf: [{ $ref: `#/$defs/${defName}` }, { type: 'string' }] },
  },
  $defs: { [defName]: { type: 'object', properties: { inner: { $ref: `#/$defs/${defName}` } } } },
});

describe('hoistEmbeddedSchemaDefs', () => {
  test('plain schema passes through untouched', () => {
    const schema: Rec = { type: 'object', properties: { a: { type: 'string' } } };
    expect(hoistEmbeddedSchemaDefs(schema as never)).toBe(schema);
  });

  test('embedded doc refs resolve from the root after hoisting', () => {
    const schema: Rec = {
      type: 'object',
      properties: { doc: contractDoc('widget-doc', '__schema0') },
    };
    const out = hoistEmbeddedSchemaDefs(schema as never) as Rec;
    const doc = out.properties as Rec;
    const embedded = doc.doc as Rec;
    expect(embedded.$id).toBeUndefined();
    expect(embedded.$schema).toBeUndefined();
    expect(embedded.$defs).toBeUndefined();
    const slug = 'urn_harnesys_contracts_dashboards_widget_doc';
    const defs = out.$defs as Record<string, Rec>;
    expect(Object.keys(defs)).toEqual([`${slug}____schema0`]);
    const value = (embedded.properties as Rec).value as Rec;
    expect(value.$ref).toBe(`#/$defs/${slug}____schema0`);
    const hoisted = defs[`${slug}____schema0`] as Rec;
    const inner = ((hoisted.properties as Rec).inner as Rec).$ref;
    expect(inner).toBe(`#/$defs/${slug}____schema0`);
  });

  test('two docs with same def names do not collide', () => {
    const schema: Rec = {
      type: 'object',
      properties: {
        a: contractDoc('widget-rect', '__schema0'),
        b: contractDoc('widget-doc', '__schema0'),
      },
    };
    const out = hoistEmbeddedSchemaDefs(schema as never) as Rec;
    const defs = Object.keys(out.$defs as Record<string, unknown>);
    expect(defs).toEqual([
      'urn_harnesys_contracts_dashboards_widget_rect____schema0',
      'urn_harnesys_contracts_dashboards_widget_doc____schema0',
    ]);
  });

  test('root $defs stay in place and refs without an enclosing $id are untouched', () => {
    const schema: Rec = {
      type: 'object',
      properties: { a: { $ref: '#/$defs/rootOne' } },
      $defs: { rootOne: { type: 'string' } },
    };
    const out = hoistEmbeddedSchemaDefs(schema as never) as Rec;
    expect(out).toEqual(schema);
  });

  test('innermost $id scope wins for refs inside hoisted defs', () => {
    const inner = contractDoc('inner', '__schema0');
    const outer: Rec = {
      $id: 'urn:harnesys:contracts:dashboards:outer',
      type: 'object',
      properties: { child: inner },
      $defs: { __schema1: { type: 'number' } },
    };
    const out = hoistEmbeddedSchemaDefs({
      type: 'object',
      properties: { doc: outer },
    } as never) as Rec;
    const defs = out.$defs as Record<string, Rec>;
    const outerDef = defs.urn_harnesys_contracts_dashboards_outer____schema1;
    expect(outerDef).toEqual({ type: 'number' });
    const innerDoc = (out.properties as Rec).doc as Rec;
    const innerValue = ((innerDoc.properties as Rec).child as Rec).properties as Rec;
    expect((innerValue.value as Rec).$ref).toBe(
      '#/$defs/urn_harnesys_contracts_dashboards_inner____schema0',
    );
    expect(defs.urn_harnesys_contracts_dashboards_inner____schema0).toBeDefined();
  });
});
