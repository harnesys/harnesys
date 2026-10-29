import { DomainException } from '@harnesys/brix';
import {
  GitBranchExistsError,
  GitBranchInvalidError,
  GitDirtyError,
  GitNotFoundError,
  GitNotRepoError,
  GitTimeoutError,
} from '../../domain/source/git-vcs.error.ts';
import {
  GitOperationException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';

export function mapGitVcsError(err: unknown): never {
  if (err instanceof DomainException) {
    throw err;
  }
  if (err instanceof GitBranchInvalidError) {
    throw new SourcePathInvalidException(err.message);
  }
  if (
    err instanceof GitBranchExistsError ||
    err instanceof GitDirtyError ||
    err instanceof GitNotFoundError ||
    err instanceof GitNotRepoError ||
    err instanceof GitTimeoutError
  ) {
    throw new GitOperationException(err.message);
  }
  if (err instanceof Error) {
    const message = err.message.trim() || 'git operation failed';
    if (/invalid (path|cwd|commit message|branch)/i.test(message)) {
      throw new SourcePathInvalidException(message);
    }
    throw new GitOperationException(message);
  }
  throw new GitOperationException(String(err));
}
