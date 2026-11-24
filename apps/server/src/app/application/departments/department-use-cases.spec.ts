import { describe, expect, test } from 'bun:test';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  DepartmentConflictException,
  DepartmentNotFoundException,
  DepartmentValidationException,
} from '../../domain/department/department.error.ts';
import type { DepartmentPatch, DepartmentRecord } from '../../domain/department/department.ts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { CreateDepartmentUseCase } from './create-department.use-case.ts';
import { DeleteDepartmentUseCase } from './delete-department.use-case.ts';
import { UpdateDepartmentUseCase } from './update-department.use-case.ts';

const ORG_ID = 'org-1';
const NOW = '2026-01-01T00:00:00.000Z';

function agentRecord(id: string, departmentId: string | null): AgentRecord {
  return {
    id,
    orgId: ORG_ID,
    name: `agent-${id}`,
    role: 'dev',
    instructions: '',
    modelId: 'model-1',
    budgetUsdDaily: null,
    level: 'top',
    parentId: null,
    departmentId,
    executionProfileId: null,
    status: 'active',
    sharedSourceIds: [],
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: null,
    defaultRunDirectory: null,
    defaultWorkspaceRef: null,
    config: {},
    hooks: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

class FakeDepartments extends DepartmentRegistryPort {
  rows: DepartmentRecord[] = [];
  list(orgId: string): DepartmentRecord[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }
  findById(orgId: string, id: string): DepartmentRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.id === id);
  }
  findByName(orgId: string, name: string): DepartmentRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.name === name);
  }
  insert(rec: DepartmentRecord): DepartmentRecord {
    this.rows.push(rec);
    return rec;
  }
  update(orgId: string, id: string, patch: DepartmentPatch): DepartmentRecord {
    const found = this.findById(orgId, id);
    if (!found) {
      throw new DepartmentNotFoundException(id);
    }
    return Object.assign(found, patch, { updatedAt: NOW });
  }
  delete(orgId: string, id: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.id === id));
  }
}

class FakeAgents extends AgentRegistryPort {
  rows: AgentRecord[] = [];
  list(orgId: string): AgentRecord[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }
  findById(orgId: string, id: string): AgentRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.id === id);
  }
  findByName(orgId: string, name: string): AgentRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.name === name);
  }
  insert(rec: AgentRecord): AgentRecord {
    this.rows.push(rec);
    return rec;
  }
  update(orgId: string, id: string, patch: Partial<AgentRecord>): AgentRecord {
    const found = this.findById(orgId, id);
    if (!found) {
      throw new Error(`agent ${id} not found`);
    }
    return Object.assign(found, patch, { updatedAt: NOW });
  }
  delete(orgId: string, id: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.id === id));
  }
}

describe('CreateDepartmentUseCase', () => {
  test('creates a department with lead and unique name', () => {
    const departments = new FakeDepartments();
    const agents = new FakeAgents();
    agents.insert(agentRecord('agent-1', null));
    const useCase = new CreateDepartmentUseCase(departments, agents);
    const created = useCase.execute({
      orgId: ORG_ID,
      body: { name: 'Engineering', leadAgentId: 'agent-1' },
    });
    expect(created.name).toBe('Engineering');
    expect(created.leadAgentId).toBe('agent-1');
    expect(created.parentId).toBeNull();
  });

  test('rejects duplicate name and unknown lead', () => {
    const departments = new FakeDepartments();
    const agents = new FakeAgents();
    const useCase = new CreateDepartmentUseCase(departments, agents);
    departments.insert({
      id: 'dep-1',
      orgId: ORG_ID,
      name: 'Engineering',
      parentId: null,
      leadAgentId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(() => useCase.execute({ orgId: ORG_ID, body: { name: 'Engineering' } })).toThrow(
      DepartmentConflictException,
    );
    expect(() =>
      useCase.execute({ orgId: ORG_ID, body: { name: 'Ops', leadAgentId: 'ghost' } }),
    ).toThrow(AgentNotFoundException);
  });
});

describe('UpdateDepartmentUseCase', () => {
  test('renames and sets lead', () => {
    const departments = new FakeDepartments();
    const agents = new FakeAgents();
    agents.insert(agentRecord('agent-1', null));
    departments.insert({
      id: 'dep-1',
      orgId: ORG_ID,
      name: 'Engineering',
      parentId: null,
      leadAgentId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const useCase = new UpdateDepartmentUseCase(departments, agents);
    const updated = useCase.execute({
      orgId: ORG_ID,
      departmentId: 'dep-1',
      body: { name: 'Platform', leadAgentId: 'agent-1' },
    });
    expect(updated.name).toBe('Platform');
    expect(updated.leadAgentId).toBe('agent-1');
  });

  test('rejects self parent, unknown lead and unknown department', () => {
    const departments = new FakeDepartments();
    const agents = new FakeAgents();
    departments.insert({
      id: 'dep-1',
      orgId: ORG_ID,
      name: 'Engineering',
      parentId: null,
      leadAgentId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const useCase = new UpdateDepartmentUseCase(departments, agents);
    expect(() =>
      useCase.execute({ orgId: ORG_ID, departmentId: 'dep-1', body: { parentId: 'dep-1' } }),
    ).toThrow(DepartmentValidationException);
    expect(() =>
      useCase.execute({ orgId: ORG_ID, departmentId: 'dep-1', body: { leadAgentId: 'ghost' } }),
    ).toThrow(AgentNotFoundException);
    expect(() =>
      useCase.execute({ orgId: ORG_ID, departmentId: 'ghost', body: { name: 'X' } }),
    ).toThrow(DepartmentNotFoundException);
  });
});

describe('DeleteDepartmentUseCase', () => {
  test('clears departmentId on member agents', () => {
    const departments = new FakeDepartments();
    const agents = new FakeAgents();
    agents.insert(agentRecord('agent-1', 'dep-1'));
    agents.insert(agentRecord('agent-2', null));
    departments.insert({
      id: 'dep-1',
      orgId: ORG_ID,
      name: 'Engineering',
      parentId: null,
      leadAgentId: 'agent-1',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const useCase = new DeleteDepartmentUseCase(departments, agents);
    useCase.execute({ orgId: ORG_ID, departmentId: 'dep-1' });
    expect(departments.findById(ORG_ID, 'dep-1')).toBeUndefined();
    expect(agents.findById(ORG_ID, 'agent-1')?.departmentId).toBeNull();
    expect(agents.findById(ORG_ID, 'agent-2')?.departmentId).toBeNull();
  });
});
