import { Injectable } from '@harnesys/brix';
import type { CreateDepartmentBody, DepartmentPublic } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DepartmentConflictException } from '../../domain/department/department.error.ts';
import type { DepartmentRecord } from '../../domain/department/department.ts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { requireAgent } from '../agents/agent.helpers.ts';
import {
  assertNonEmptyDepartmentName,
  requireDepartment,
  toDepartmentPublic,
} from './department.helpers.ts';

export interface CreateDepartmentRequest {
  orgId: string;
  body: CreateDepartmentBody;
}

@Injectable()
export class CreateDepartmentUseCase {
  constructor(
    private readonly departments: DepartmentRegistryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: CreateDepartmentRequest): DepartmentPublic {
    const name = assertNonEmptyDepartmentName(request.body.name);
    if (this.departments.findByName(request.orgId, name)) {
      throw new DepartmentConflictException('department name taken in org');
    }
    if (request.body.leadAgentId) {
      requireAgent(this.agents, request.orgId, request.body.leadAgentId);
    }
    if (request.body.parentId) {
      requireDepartment(this.departments, request.orgId, request.body.parentId);
    }
    const now = new Date().toISOString();
    const record: DepartmentRecord = {
      id: crypto.randomUUID(),
      orgId: request.orgId,
      name,
      parentId: request.body.parentId ?? null,
      leadAgentId: request.body.leadAgentId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    return toDepartmentPublic(this.departments.insert(record));
  }
}
