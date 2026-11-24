import { Injectable } from '@harnesys/brix';
import type { ListDepartmentsResponse } from '@harnesys/contracts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { toDepartmentPublic } from './department.helpers.ts';

export interface ListDepartmentsRequest {
  orgId: string;
}

@Injectable()
export class ListDepartmentsUseCase {
  constructor(private readonly departments: DepartmentRegistryPort) {}

  execute(request: ListDepartmentsRequest): ListDepartmentsResponse {
    return { items: this.departments.list(request.orgId).map(toDepartmentPublic) };
  }
}
