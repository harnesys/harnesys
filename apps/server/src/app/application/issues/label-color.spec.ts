import { describe, expect, test } from 'bun:test';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';
import { resolveLabelColor } from './label-color.ts';

describe('resolveLabelColor', () => {
  test('hex passes through', () => {
    expect(resolveLabelColor('#AABBcc')).toBe('#AABBcc');
  });

  test('a palette name normalizes to canonical hex', () => {
    expect(resolveLabelColor('blue')).toBe('#3b82f6');
    expect(resolveLabelColor('Purple')).toBe('#a855f7');
  });

  test('an unknown name fails with a hex hint', () => {
    expect(() => resolveLabelColor('bluish')).toThrow(IssueValidationException);
    expect(() => resolveLabelColor('bluish')).toThrow('#RRGGBB');
  });

  test('omitted color falls back to gray', () => {
    expect(resolveLabelColor(undefined)).toBe('#6b7280');
  });
});
