import { describe, expect, test } from 'bun:test';
import type { KnowledgeSettings } from '@harnesys/studio-shared';
import { KnowledgeValidationException } from '../../domain/knowledge/knowledge.error.ts';
import { validateKnowledgeSettingsPatch } from './put-knowledge-settings.use-case.ts';

const current: KnowledgeSettings = {
  sourceId: 'src-1',
  entireSource: false,
  backend: 'fts',
  embedProvider: null,
  embedModel: null,
  watchEnabled: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('validateKnowledgeSettingsPatch', () => {
  test('allows fts without embed', () => {
    expect(() =>
      validateKnowledgeSettingsPatch({ backend: 'fts', entireSource: true }, current),
    ).not.toThrow();
  });

  test('rejects embedProvider without embedModel', () => {
    expect(() => validateKnowledgeSettingsPatch({ embedProvider: 'openai' }, current)).toThrow(
      KnowledgeValidationException,
    );
  });

  test('rejects vector without embed pair', () => {
    expect(() => validateKnowledgeSettingsPatch({ backend: 'vector' }, current)).toThrow(
      KnowledgeValidationException,
    );
  });

  test('allows vector when both embed fields set', () => {
    expect(() =>
      validateKnowledgeSettingsPatch(
        { backend: 'vector', embedProvider: 'openai', embedModel: 'text-embedding-3-small' },
        current,
      ),
    ).not.toThrow();
  });
});
