import type { FieldErrorCode } from '@harnesys/contracts';

export const FIELD_ERROR_TEXT: Record<FieldErrorCode, string> = {
  required: 'This field is required',
  pattern: 'The value does not match the expected format',
  type: 'The value has the wrong type',
  option: 'Pick one of the listed options',
  unknown: 'The value was rejected',
};
