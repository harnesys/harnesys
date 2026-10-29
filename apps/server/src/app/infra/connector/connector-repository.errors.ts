import {
  ConnectorConflictException,
  ConnectorValidationException,
} from '../../domain/connector/connector.error.ts';

export function mapConnectorSqliteError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('UNIQUE') && message.includes('bot_user')) {
    throw new ConnectorConflictException('This bot is already connected to another agent');
  }
  if (message.includes('FOREIGN KEY') || message.includes('constraint')) {
    throw new ConnectorValidationException('invalid connector reference');
  }
  throw err instanceof Error ? err : new Error(message);
}
