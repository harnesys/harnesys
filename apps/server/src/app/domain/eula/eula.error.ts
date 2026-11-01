import { HttpException } from '@harnesys/brix';

export class EulaVersionMismatchException extends HttpException {
  constructor() {
    super(400, 'EULA_VERSION_MISMATCH', 'The agreement id does not match the current agreement');
  }
}
