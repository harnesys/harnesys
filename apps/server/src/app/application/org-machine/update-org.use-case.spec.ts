import { describe, expect, test } from 'bun:test';
import type { MachineOrgEntry } from '@harnesys/contracts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';
import { UpdateOrgUseCase } from './update-org.use-case.ts';

class FakeStore extends OrgMachineStore {
  constructor(private entries: MachineOrgEntry[]) {
    super();
  }
  list(): MachineOrgEntry[] {
    return this.entries;
  }
  upsert(entry: MachineOrgEntry): void {
    const index = this.entries.findIndex((row) => row.orgId === entry.orgId);
    if (index === -1) {
      this.entries.push(entry);
    } else {
      this.entries[index] = entry;
    }
  }
  remove(): void {}
  getActive(): string | null {
    return this.entries[0]?.orgId ?? null;
  }
  setActive(): void {}
  get(orgId: string): MachineOrgEntry | undefined {
    return this.entries.find((entry) => entry.orgId === orgId);
  }
}

class FakeOrgDb extends OrgDbPort {
  renamed: Array<{ orgId: string; name: string }> = [];
  bootstrap(): void {}
  rename(orgId: string, name: string): void {
    this.renamed.push({ orgId, name });
  }
}

describe('UpdateOrgUseCase', () => {
  test('description persists on store', () => {
    const store = new FakeStore([{ orgId: 'org-1', name: 'Org', description: '', role: 'relay' }]);
    const orgDb = new FakeOrgDb();
    const useCase = new UpdateOrgUseCase(store, orgDb);
    const updated = useCase.execute({ orgId: 'org-1', description: 'Fleet studio' });
    expect(updated.description).toBe('Fleet studio');
    expect(store.get('org-1')?.description).toBe('Fleet studio');
    expect(orgDb.renamed).toEqual([]);
  });
});
