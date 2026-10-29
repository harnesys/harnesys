import { describe, expect, test } from 'bun:test';
import {
  isModelKind,
  isModelKindSupported,
  MODEL_KINDS,
  modelKindFromOutputModalities,
  SUPPORTED_MODEL_KINDS,
} from './models.ts';

describe('model kind support contract', () => {
  test('covers exactly 9 kinds', () => {
    expect([...MODEL_KINDS]).toEqual([
      'chat',
      'embed',
      'image',
      'audio',
      'decision',
      'rerank',
      'speech',
      'transcription',
      'video',
    ]);
  });

  test('supports only kinds with a working execution path', () => {
    expect([...SUPPORTED_MODEL_KINDS]).toEqual([
      'chat',
      'embed',
      'decision',
      'image',
      'speech',
      'transcription',
    ]);
    expect(MODEL_KINDS.filter((kind) => !isModelKindSupported(kind))).toEqual([
      'audio',
      'rerank',
      'video',
    ]);
  });

  test('isModelKind narrows known kinds and rejects the rest', () => {
    expect(isModelKind('rerank')).toBe(true);
    expect(isModelKind('stt')).toBe(false);
    expect(isModelKind(undefined)).toBe(false);
  });

  test('classification never yields an unsupported kind outside the map', () => {
    for (const outputs of [
      ['text'],
      ['embeddings'],
      ['decisions'],
      ['image'],
      ['audio', 'speech'],
      ['video'],
      ['transcription'],
      ['rerank'],
      undefined,
    ]) {
      const kind = modelKindFromOutputModalities(outputs);
      expect(MODEL_KINDS).toContain(kind);
    }
  });
});
