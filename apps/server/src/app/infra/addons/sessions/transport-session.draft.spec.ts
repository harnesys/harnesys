import { describe, expect, it } from 'bun:test';
import {
  applyDelta,
  emptyDraft,
  optionByLabel,
  optionIndexFrom,
  renderDraft,
} from './transport-session.draft.ts';

describe('transport session draft', () => {
  it('appends deltas in order', () => {
    const first = applyDelta(emptyDraft(), { text: 'he', seq: 1 });
    const second = applyDelta(first, { text: 'llo', seq: 2 });
    expect(second.text).toBe('hello');
    expect(second.lastSeq).toBe(2);
  });

  it('ignores replayed deltas at or below the last seq', () => {
    const draft = applyDelta({ text: 'hello', lastSeq: 5 }, { text: 'llo', seq: 4 });
    expect(draft.text).toBe('hello');
    expect(draft.lastSeq).toBe(5);
  });

  it('keeps the tail when the draft exceeds the channel limit', () => {
    expect(renderDraft('abcdef', 3)).toBe('def');
    expect(renderDraft('abc', 3)).toBe('abc');
  });

  it('matches an answer by number or label', () => {
    const options = ['approve', 'deny'];
    expect(optionIndexFrom('2', options.length)).toBe(1);
    expect(optionIndexFrom('3', options.length)).toBeNull();
    expect(optionIndexFrom('approve', options.length)).toBeNull();
    expect(optionByLabel(' Approve ', options)).toBe(0);
    expect(optionByLabel('allow', options)).toBeNull();
  });
});
