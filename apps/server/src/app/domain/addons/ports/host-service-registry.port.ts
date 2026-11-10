import type { HostMethodSpec, HostServiceModule, HostServiceViolation } from '../host-service.ts';

export abstract class HostServiceRegistryPort {
  abstract register(module: HostServiceModule): void;

  abstract lookup(namespace: string, method: string): HostMethodSpec | undefined;

  abstract modules(): readonly HostServiceModule[];

  abstract validateBoot(): readonly HostServiceViolation[];
}
