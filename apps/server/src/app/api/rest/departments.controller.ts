import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@harnesys/brix';
import type {
  CreateDepartmentBody,
  DepartmentPublic,
  ListDepartmentsResponse,
  UpdateDepartmentBody,
} from '@harnesys/contracts';
import { CreateDepartmentBodySchema, UpdateDepartmentBodySchema } from '@harnesys/contracts';
import { CreateDepartmentUseCase } from '../../application/departments/create-department.use-case.ts';
import { DeleteDepartmentUseCase } from '../../application/departments/delete-department.use-case.ts';
import { ListDepartmentsUseCase } from '../../application/departments/list-departments.use-case.ts';
import { UpdateDepartmentUseCase } from '../../application/departments/update-department.use-case.ts';

@Controller('orgs/:orgId/departments')
export class DepartmentsController {
  constructor(
    private readonly listDepartments: ListDepartmentsUseCase,
    private readonly createDepartment: CreateDepartmentUseCase,
    private readonly updateDepartment: UpdateDepartmentUseCase,
    private readonly deleteDepartment: DeleteDepartmentUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListDepartmentsResponse {
    return this.listDepartments.execute({ orgId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateDepartmentBodySchema) body: CreateDepartmentBody,
  ): DepartmentPublic {
    return this.createDepartment.execute({ orgId, body });
  }

  @Patch(':departmentId')
  update(
    @Param('orgId') orgId: string,
    @Param('departmentId') departmentId: string,
    @Body(UpdateDepartmentBodySchema) body: UpdateDepartmentBody,
  ): DepartmentPublic {
    return this.updateDepartment.execute({ orgId, departmentId, body });
  }

  @Delete(':departmentId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('departmentId') departmentId: string): void {
    this.deleteDepartment.execute({ orgId, departmentId });
  }
}
