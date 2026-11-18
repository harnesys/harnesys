import { describe, expect, test } from 'bun:test';
import { DashboardWidgetValidationException } from './dashboard.error.ts';
import { validateWidgetDoc } from './widget-doc.guard.ts';

const ORG_ID = 'acme';

describe('validateWidgetDoc', () => {
  test('wraps check findings in the one exception contract', () => {
    try {
      validateWidgetDoc(ORG_ID, {
        schemaVersion: 1,
        title: 'Stray key',
        items: [],
        stray: true,
      });
      throw new Error('expected a validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(DashboardWidgetValidationException);
      const details = (error as DashboardWidgetValidationException).details as {
        issues?: { path: string; message: string }[];
      };
      expect(details.issues?.length).toBeGreaterThan(0);
    }
  });
});
