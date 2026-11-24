import { Module } from '@harnesys/brix';
import { CreateDepartmentUseCase } from './create-department.use-case.ts';
import { DeleteDepartmentUseCase } from './delete-department.use-case.ts';
import { ListDepartmentsUseCase } from './list-departments.use-case.ts';
import { UpdateDepartmentUseCase } from './update-department.use-case.ts';

const useCases = [
  ListDepartmentsUseCase,
  CreateDepartmentUseCase,
  UpdateDepartmentUseCase,
  DeleteDepartmentUseCase,
];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class DepartmentUseCaseModule {}
