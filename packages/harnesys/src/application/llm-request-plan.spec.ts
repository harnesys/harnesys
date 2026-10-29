import { describe, expect, test } from 'bun:test';
import type { ToolDefinition } from '../ports/tools.ts';
import { buildRequestPlan } from './llm-request-plan.ts';

function registry(entries: Array<[name: string, group: string]>): Map<string, ToolDefinition> {
  return new Map(
    entries.map(([name, group]) => [
      name,
      {
        name,
        group,
        description: `desc ${name}`,
        input: { type: 'object', properties: {} },
        execute: () => 'done',
      } as ToolDefinition,
    ]),
  );
}

const base = {
  prompt: 'You are a helpful agent.',
  channelNote: '',
  skillsSection: 'Skills catalog here.',
  runtimeSection: '',
};

describe('buildRequestPlan', () => {
  test('splits tool sections by group and partitions tool names', () => {
    const reg = registry([
      ['read_file', 'files'],
      ['list_issues', 'issues'],
      ['mcp_search', 'docs-server'],
      ['unknown_tool', 'other'],
    ]);
    const plan = buildRequestPlan({
      ...base,
      instructions: base.prompt,
      toolNames: ['read_file', 'list_issues', 'mcp_search', 'unknown_tool'],
      toolRegistry: reg,
      notes: [],
      requestMessages: [],
    });
    const ids = plan.sections.map((s) => s.id);
    expect(ids).toContain('tools.files');
    expect(ids).toContain('tools.issues');
    expect(ids).toContain('tools.docs-server');
    expect(ids).toContain('tools.other');
    expect(ids).toContain('tools');
    const toolGroups = plan.sections.filter(
      (s) => s.id.startsWith('tools.') && s.id !== 'tools.deferred',
    );
    expect(toolGroups).toHaveLength(4);
    for (const s of plan.sections) {
      expect(s.estTokens).toBe(Math.ceil(s.chars / 4));
    }
  });

  test('separates deferred catalog from plain notes', () => {
    const plan = buildRequestPlan({
      ...base,
      instructions: base.prompt,
      toolNames: [],
      toolRegistry: new Map(),
      notes: [
        { tag: 'memory', text: 'Some memory note.' },
        { tag: 'tools', text: 'Deferred tool catalog text.' },
      ],
      requestMessages: [],
    });
    const notes = plan.sections.find((s) => s.id === 'notes');
    const deferred = plan.sections.find((s) => s.id === 'tools.deferred');
    expect(notes?.chars).toBe('Some memory note.'.length);
    expect(deferred?.chars).toBe('Deferred tool catalog text.'.length);
  });

  test('history section sums message token estimates', () => {
    const messages = [
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'hi there' },
    ];
    const plan = buildRequestPlan({
      ...base,
      instructions: base.prompt,
      toolNames: [],
      toolRegistry: new Map(),
      notes: [],
      requestMessages: messages,
    });
    const history = plan.sections.find((s) => s.id === 'history');
    expect(history).toBeDefined();
    expect(history?.estTokens).toBeGreaterThan(0);
    expect(plan.totalEstTokens).toBe(plan.sections.reduce((sum, s) => sum + s.estTokens, 0));
    expect(plan.totalChars).toBe(plan.sections.reduce((sum, s) => sum + s.chars, 0));
  });

  test('empty parts are skipped and totals stay consistent', () => {
    const plan = buildRequestPlan({
      prompt: 'Only prompt.',
      channelNote: '',
      skillsSection: '',
      runtimeSection: '',
      instructions: 'Only prompt.',
      toolNames: [],
      toolRegistry: new Map(),
      notes: [],
      requestMessages: [],
    });
    expect(plan.sections.map((s) => s.id)).toEqual(['system.prompt']);
    expect(plan.totalChars).toBe('Only prompt.'.length);
  });
});
