import { Injectable } from '@harnesys/brix';
import type { DepartmentPublic, UpdateDepartmentBody } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  DepartmentConflictException,
  DepartmentValidationException,
} from '../../domain/department/department.error.ts';
import type { DepartmentPatch } from '../../domain/department/department.ts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { requireAgent } from '../agents/agent.helpers.ts';
import { requireDepartment, toDepartmentPublic } from './department.helpers.ts';

export interface UpdateDepartmentRequest {
  orgId: string;
  departmentId: string;
  body: UpdateDepartmentBody;
}

@Injectable()
export class UpdateDepartmentUseCase {
  constructor(
    private readonly departments: DepartmentRegistryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: UpdateDepartmentRequest): DepartmentPublic {
    requireDepartment(this.departments, request.orgId, request.departmentId);
    const patch = this.buildPatch(request);
    return toDepartmentPublic(this.departments.update(request.orgId, request.departmentId, patch));
  }

  private buildPatch(request: UpdateDepartmentRequest): DepartmentPatch {
    const patch: DepartmentPatch = {};
    const { body } = request;
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) {
        throw new DepartmentValidationException('department name cannot be empty');
      }
      const existing = this.departments.findByName(request.orgId, name);
      if (existing && existing.id !== request.departmentId) {
        throw new DepartmentConflictException('department name taken in org');
      }
      patch.name = name;
    }
    if (body.parentId !== undefined) {
      if (body.parentId !== null) {
        if (body.parentId === request.departmentId) {
          throw new DepartmentValidationException('department cannot be its own parent');
        }
        requireDepartment(this.departments, request.orgId, body.parentId);
      }
      patch.parentId = body.parentId;
    }
    if (body.leadAgentId !== undefined) {
      if (body.leadAgentId !== null) {
        requireAgent(this.agents, request.orgId, body.leadAgentId);
      }
      patch.leadAgentId = body.leadAgentId;
    }
    return patch;
  }
}
