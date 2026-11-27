import { describe, expect, test } from 'bun:test';
import type { IssueLabelInsert, IssueLabelRecord } from '../../domain/issue/label.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { StubEvents } from './create-issue.use-case.work-fakes.ts';
import { CreateIssueLabelUseCase } from './create-issue-label.use-case.ts';

const NOW = new Date(0).toISOString();
const ORG_ID = 'org-1';

class UnorderedLabelRows extends IssueLabelRepositoryPort {
  readonly persisted: IssueLabelRecord[] = [
    {
      id: 'label-old',
      orgId: ORG_ID,
      title: 'Legacy',
      color: '#6b7280',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  listByOrg(orgId: string): IssueLabelRecord[] {
    return this.persisted.filter((row) => row.orgId === orgId).map((row) => ({ ...row }));
  }

  findById(orgId: string, id: string): IssueLabelRecord | undefined {
    return this.listByOrg(orgId).find((row) => row.id === id);
  }

  insert(rec: IssueLabelInsert): IssueLabelRecord {
    const created: IssueLabelRecord = { ...rec };
    this.persisted.unshift(created);
    return { ...created };
  }

  update(): never {
    throw new Error('not used');
  }

  delete(): void {}
}

describe('CreateIssueLabelUseCase', () => {
  test('returns exactly the created record, not the list tail', () => {
    const labels = new UnorderedLabelRows();
    const events = new StubEvents();
    const useCase = new CreateIssueLabelUseCase(labels, events);

    const response = useCase.execute({ orgId: ORG_ID, body: { title: 'Ready for review' } });

    const created = labels.persisted.find((row) => row.title === 'Ready for review');
    if (!created) {
      throw new Error('the created row is missing from the repository');
    }
    expect(response.label).toEqual({
      id: created.id,
      title: created.title,
      color: created.color,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
    expect(response.label.id).not.toBe('label-old');
    expect(response.items).toHaveLength(2);
    expect(response.items.at(-1)?.id).toBe('label-old');
    expect(events.emitted).toEqual([ORG_ID]);
  });
});
