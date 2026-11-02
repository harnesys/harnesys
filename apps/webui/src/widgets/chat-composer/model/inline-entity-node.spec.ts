import { describe, expect, test } from 'bun:test';
import { inlineEntityText } from './inline-entity-node';

describe('inline entity text for the agent', () => {
  test('terminal chip carries the session id next to the name', () => {
    expect(inlineEntityText('terminal', 'build logs', 'ses-1')).toBe(
      'build logs (terminal id: ses-1)',
    );
  });

  test('source, board, schedule and webhook chips carry their ids', () => {
    expect(inlineEntityText('source', 'webui', 'src-1')).toBe('webui (source id: src-1)');
    expect(inlineEntityText('board', 'Roadmap', 'brd-1')).toBe('Roadmap (board id: brd-1)');
    expect(inlineEntityText('schedule', 'nightly', 'sch-1')).toBe('nightly (schedule id: sch-1)');
    expect(inlineEntityText('webhook', 'github', 'wh-1')).toBe('github (webhook id: wh-1)');
  });

  test('skill chip stays a bare name', () => {
    expect(inlineEntityText('skill', 'plan', '')).toBe('plan');
  });
});
