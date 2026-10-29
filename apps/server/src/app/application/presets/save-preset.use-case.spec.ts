import { describe, expect, test } from 'bun:test';
import type { AgentPresetBody, TeamPresetBody } from '@harnesys/contracts';
import { FakePresetStore } from './preset-library.fakes.ts';
import { SavePresetUseCase } from './save-preset.use-case.ts';

const agentBody: AgentPresetBody = {
  name: 'Coder',
  role: 'Engineer',
  instructions: 'write code',
};

const singleStatus = {
  key: 'backlog',
  label: 'Backlog',
  category: 'backlog',
  order: 0,
  isEntry: true,
} as const;

const teamBody: TeamPresetBody = {
  roles: [
    {
      roleKey: 'coder',
      name: 'Coder',
      agentRef: 'harnesys/coder',
      budgetUsdDaily: 10,
      requiresModel: true,
    },
  ],
  board: {
    statuses: [
      { key: 'backlog', label: 'Backlog', category: 'backlog', order: 0, isEntry: true },
      { key: 'done', label: 'Done', category: 'finished', order: 1, isEntry: false },
    ],
    rules: [],
  },
  digest: { cronDefault: '0 9 * * *', roleKey: 'coder', detail: 'daily' },
};

describe('SavePresetUseCase', () => {
  test('rejects mutating a system preset', () => {
    const store = new FakePresetStore();
    store.save({
      id: 'harnesys/coder',
      kind: 'agent',
      origin: 'system',
      version: '1.0.0',
      name: 'Coder',
      body: agentBody,
    });
    const useCase = new SavePresetUseCase(store);
    expect(() =>
      useCase.execute({
        body: { kind: 'agent', id: 'harnesys/coder', name: 'Coder', body: agentBody },
      }),
    ).toThrow(/PRESET_IMMUTABLE|system presets are immutable/);
  });

  test('rejects the same id with another kind', () => {
    const store = new FakePresetStore();
    store.save({
      id: 'local/thing',
      kind: 'agent',
      origin: 'user',
      version: '1.0.0',
      name: 'Thing',
      body: agentBody,
    });
    const useCase = new SavePresetUseCase(store);
    expect(() =>
      useCase.execute({
        body: {
          kind: 'team',
          id: 'local/thing',
          name: 'Thing',
          body: { ...teamBody, roles: [] } as TeamPresetBody,
        },
      }),
    ).toThrow(/PRESET_CONFLICT|taken by another kind/);
  });

  test('rejects the reserved harnesys namespace', () => {
    const useCase = new SavePresetUseCase(new FakePresetStore());
    expect(() =>
      useCase.execute({
        body: { kind: 'agent', id: 'harnesys/mine', name: 'Mine', body: agentBody },
      }),
    ).toThrow(/PRESET_VALIDATION|reserved for system presets/);
  });

  test('bumps the version on every save', () => {
    const store = new FakePresetStore();
    const useCase = new SavePresetUseCase(store);
    const first = useCase.execute({
      body: { kind: 'agent', id: 'local/coder', name: 'Coder', body: agentBody },
    });
    expect(first.version).toBe('1.0.0');
    const second = useCase.execute({
      body: { kind: 'agent', id: 'local/coder', name: 'Coder', body: agentBody },
    });
    expect(second.version).toBe('1.0.1');
  });

  test('rejects an explicit lower version', () => {
    const store = new FakePresetStore();
    const useCase = new SavePresetUseCase(store);
    useCase.execute({
      body: { kind: 'agent', id: 'local/coder', name: 'Coder', body: agentBody, version: '2.0.0' },
    });
    expect(() =>
      useCase.execute({
        body: {
          kind: 'agent',
          id: 'local/coder',
          name: 'Coder',
          body: agentBody,
          version: '1.9.0',
        },
      }),
    ).toThrow(/PRESET_CONFLICT|must increase/);
  });

  test('rejects a team preset with a single board status', () => {
    const store = new FakePresetStore();
    const useCase = new SavePresetUseCase(store);
    expect(() =>
      useCase.execute({
        body: {
          kind: 'team',
          id: 'local/team',
          name: 'Team',
          body: {
            ...teamBody,
            board: { ...teamBody.board, statuses: [singleStatus] },
          },
        },
      }),
    ).toThrow(/PRESET_VALIDATION|invalid statuses/);
  });

  test('rejects a rule that assigns an unknown role', () => {
    const store = new FakePresetStore();
    const useCase = new SavePresetUseCase(store);
    expect(() =>
      useCase.execute({
        body: {
          kind: 'team',
          id: 'local/team',
          name: 'Team',
          body: {
            ...teamBody,
            board: {
              ...teamBody.board,
              rules: [
                {
                  trigger: { type: 'status_entered', statusKey: 'backlog' },
                  conditions: [],
                  actions: [{ type: 'assign_agent', roleKey: 'ghost' }],
                  position: 0,
                  enabled: true,
                },
              ],
            },
          },
        },
      }),
    ).toThrow(/PRESET_VALIDATION|unknown role/);
  });
});
