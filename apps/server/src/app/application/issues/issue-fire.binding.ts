import { Injectable, Logger } from '@harnesys/brix';
import type {
  IssueFirePort,
  IssueFireRequest,
  IssueFireResult,
} from '../../domain/issue/issue-fire.port.ts';
import { FireIssueUseCase } from './fire-issue.use-case.ts';

@Injectable()
export class IssueFireBinding implements IssueFirePort {
  private readonly log: Logger;

  constructor(
    private readonly fireIssue: FireIssueUseCase,
    logger: Logger,
  ) {
    this.log = logger.child('issue-fire');
  }

  fire(request: IssueFireRequest): Promise<IssueFireResult> {
    return this.fireIssue.execute(request).catch((err: unknown) => {
      this.log.warn(
        { issueId: request.issueId, err: err instanceof Error ? err.message : String(err) },
        'issue fire dispatch failed',
      );
      return { outcome: 'failed' as const };
    });
  }
}
