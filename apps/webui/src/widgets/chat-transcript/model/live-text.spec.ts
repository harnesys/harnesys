import { describe, expect, test } from 'bun:test';
import { liveBlockText } from './live-text';

function text(input: string): { kind: 'text'; id: string; text: string } {
  return { kind: 'text', id: 'block-1', text: input };
}

describe('liveBlockText', () => {
  test('a tail that extends the persisted block wins', () => {
    expect(liveBlockText('Начинаю посл', text('Начинаю последовательное'))).toBe(
      'Начинаю последовательное',
    );
  });

  test('a tail that restarts mid block never truncates the block', () => {
    expect(liveBlockText('Начинаю последовательное тестирование', text('Начинаю'))).toBe(
      'Начинаю последовательное тестирование',
    );
  });

  test('a tail that diverges from the block is ignored', () => {
    expect(liveBlockText('Отчёт по шагу 2/10', text('Отчёт по шагу 3/10'))).toBe(
      'Отчёт по шагу 2/10',
    );
  });

  test('no tail or an empty tail keeps the persisted text', () => {
    expect(liveBlockText('Отчёт', null)).toBe('Отчёт');
    expect(liveBlockText('Отчёт', text(''))).toBe('Отчёт');
    expect(liveBlockText('Отчёт', { kind: 'reasoning', id: 'block-1', text: 'Отчёт дальше' })).toBe(
      'Отчёт',
    );
  });
});
