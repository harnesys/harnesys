import type { PackRegistration } from 'harnesys';

export abstract class PackRegistryPort {
  abstract register(name: string, registration: PackRegistration): void;

  abstract unregister(name: string): void;

  abstract registrations(): PackRegistration[];

  abstract find(name: string): PackRegistration | undefined;
}
