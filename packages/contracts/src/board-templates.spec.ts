import { describe, expect, it } from 'bun:test';
import { BOARD_TEMPLATES } from './board-templates.ts';

describe('board templates', () => {
  it('every template carries at least two statuses', () => {
    for (const [key, template] of Object.entries(BOARD_TEMPLATES)) {
      expect({ key, enough: template.statuses.length >= 2 }).toEqual({ key, enough: true });
    }
  });

  it('every template has exactly one entry status', () => {
    for (const [key, template] of Object.entries(BOARD_TEMPLATES)) {
      const entryCount = template.statuses.filter((status) => status.isEntry).length;
      expect({ key, entryCount }).toEqual({ key, entryCount: 1 });
    }
  });

  it('every template has a started status so board dispatch has a target', () => {
    for (const [key, template] of Object.entries(BOARD_TEMPLATES)) {
      const started = template.statuses.some((status) => status.category === 'started');
      expect({ key, hasStarted: started }).toEqual({ key, hasStarted: true });
    }
  });
});
