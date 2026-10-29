import { describe, expect, test } from 'bun:test';
import { budgetNote } from './llm-notes.ts';

describe('budgetNote', () => {
  test('shows the remainder of the run', () => {
    const note = budgetNote({ stepsLeft: 6, stepsTotal: 10, msLeft: 600000 });
    expect(note.tag).toBe('budget');
    expect(note.text).toBe(
      'steps remaining: 6/10 · time remaining: ~10 min (per run; resets on new user message). Wrap up the task within the remaining budget.',
    );
  });

  test('warns the model when the run is close to the limit', () => {
    const note = budgetNote({ stepsLeft: 3, stepsTotal: 10, warn: 'soon' });
    expect(note.text).toBe(
      'steps remaining: 3/10 — finish the current work, update the plan, summarize what remains.',
    );
  });

  test('marks the last step', () => {
    const note = budgetNote({ stepsLeft: 1, stepsTotal: 10, warn: 'last' });
    expect(note.text).toBe(
      'steps remaining: 1/10 — this is your last step: write your final report now.',
    );
  });

  test('the closing note wins over the warning', () => {
    const note = budgetNote({ stepsLeft: 1, stepsTotal: 10, warn: 'last' }, true);
    expect(note.text).toContain('This is your last step and no tools are available.');
  });
});
