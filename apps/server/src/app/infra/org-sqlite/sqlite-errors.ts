import { SQLiteError } from 'bun:sqlite';
import { EntityNotFoundException } from '@harnesys/brix';
import { KnowledgeValidationException } from '../../domain/knowledge/knowledge.error.ts';
import {
  ProviderConflictException,
  ProviderValidationException,
} from '../../domain/provider/provider.error.ts';

export interface SqliteErrorHints {
  conflict?: string;
  notFound?: string;
  invalid?: string;
}

export function mapSqliteError(err: unknown, hints: SqliteErrorHints = {}): never {
  if (err instanceof SQLiteError) {
    switch (err.code) {
      case 'SQLITE_CONSTRAINT_UNIQUE':
        throw new ProviderConflictException(hints.conflict ?? 'conflict');
      case 'SQLITE_CONSTRAINT_FOREIGNKEY':
        throw new EntityNotFoundException(hints.notFound ?? 'referenced row not found');
      case 'SQLITE_CONSTRAINT_CHECK':
        throw new ProviderValidationException(hints.invalid ?? 'invalid value');
      case 'SQLITE_BUSY':
      case 'SQLITE_BUSY_SNAPSHOT':
        throw new ProviderConflictException(hints.conflict ?? 'database busy, retry');
    }
  }
  if (err instanceof KnowledgeValidationException || err instanceof ProviderValidationException) {
    throw err;
  }
  throw err;
}
