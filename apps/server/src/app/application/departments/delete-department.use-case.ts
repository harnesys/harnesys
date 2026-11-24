import { Injectable } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { requireDepartment } from './department.helpers.ts';

export interface DeleteDepartmentRequest {
  orgId: string;
  departmentId: string;
}

@Injectable()
export class DeleteDepartmentUseCase {
  constructor(
    private readonly departments: DepartmentRegistryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: DeleteDepartmentRequest): void {
    requireDepartment(this.departments, request.orgId, request.departmentId);
    for (const agent of this.agents.list(request.orgId)) {
      if (agent.departmentId === request.departmentId) {
        this.agents.update(request.orgId, agent.id, { departmentId: null });
      }
    }
    this.departments.delete(request.orgId, request.departmentId);
  }
}
