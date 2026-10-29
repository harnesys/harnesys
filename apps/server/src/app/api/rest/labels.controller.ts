import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@harnesys/brix';
import type {
  CreateIssueLabelBody,
  ListIssueLabelsResponse,
  UpdateIssueLabelBody,
} from '@harnesys/contracts';
import { CreateIssueLabelBodySchema, UpdateIssueLabelBodySchema } from '@harnesys/contracts';
import { CreateIssueLabelUseCase } from '../../application/issues/create-issue-label.use-case.ts';
import { DeleteIssueLabelUseCase } from '../../application/issues/delete-issue-label.use-case.ts';
import { ListIssueLabelsUseCase } from '../../application/issues/list-issue-labels.use-case.ts';
import { UpdateIssueLabelUseCase } from '../../application/issues/update-issue-label.use-case.ts';

@Controller('orgs/:orgId/labels')
export class LabelsController {
  constructor(
    private readonly listLabels: ListIssueLabelsUseCase,
    private readonly createLabel: CreateIssueLabelUseCase,
    private readonly updateLabel: UpdateIssueLabelUseCase,
    private readonly deleteLabel: DeleteIssueLabelUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListIssueLabelsResponse {
    return this.listLabels.execute(orgId);
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateIssueLabelBodySchema) body: CreateIssueLabelBody,
  ): ListIssueLabelsResponse {
    return this.createLabel.execute({ orgId, body });
  }

  @Patch(':labelId')
  update(
    @Param('orgId') orgId: string,
    @Param('labelId') labelId: string,
    @Body(UpdateIssueLabelBodySchema) body: UpdateIssueLabelBody,
  ): ListIssueLabelsResponse {
    return this.updateLabel.execute({ orgId, labelId, body });
  }

  @Delete(':labelId')
  @HttpCode(204)
  delete(@Param('orgId') orgId: string, @Param('labelId') labelId: string): void {
    this.deleteLabel.execute({ orgId, labelId });
  }
}
