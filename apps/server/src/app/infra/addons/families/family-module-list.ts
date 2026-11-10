import { Injectable } from '@harnesys/brix';
import type { AddonManifest, Violation } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule, HandlerSpec } from '../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../domain/addons/owner.ts';

export interface AnyFamilyModule {
  readonly family: string;
  readonly versions: readonly number[];
  schema(v: number): z.ZodType<Record<string, unknown>>;
  readonly handlers: readonly HandlerSpec[];
  readonly permissions: readonly string[];
  register(owner: OwnerKey, descriptor: never): Disposable;
  crossCheck?(descriptor: never, manifest: AddonManifest): readonly Violation[];
}

export function domainFamilyModulesOf(
  modules: readonly AnyFamilyModule[],
): readonly FamilyModule[] {
  return modules;
}

@Injectable()
export class FamilyModuleList {
  constructor(readonly modules: readonly AnyFamilyModule[]) {}
}
