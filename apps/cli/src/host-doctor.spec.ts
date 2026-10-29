import { describe, expect, test } from 'bun:test';
import { orgDataMissing } from './host-doctor.ts';

describe('orgDataMissing', () => {
  test('relay without data dir flags, worker and present dir do not', () => {
    expect(orgDataMissing('relay', false)).toBe(true);
    expect(orgDataMissing('worker', false)).toBe(false);
    expect(orgDataMissing('relay', true)).toBe(false);
  });
});
