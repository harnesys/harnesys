import { z } from 'zod';

export const optionalAmount = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || Number.isFinite(Number(value)), 'Must be a number')
  .transform((value) => (value === '' ? undefined : Number(value)));
export const optionalPrice = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || Number.isFinite(Number(value)), 'Must be a number')
  .transform((value) => (value === '' ? undefined : value));
