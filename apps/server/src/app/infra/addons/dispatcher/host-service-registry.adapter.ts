import { Injectable } from '@harnesys/brix';
import type {
  HostMethodSpec,
  HostServiceModule,
  HostServiceViolation,
} from '../../../domain/addons/host-service.ts';
import { HostServiceRegistryPort } from '../../../domain/addons/ports/host-service-registry.port.ts';
import { PermissionDefinitionRegistry } from './permission-definitions.ts';

@Injectable()
export class InMemoryHostServiceRegistry extends HostServiceRegistryPort {
  private readonly methods = new Map<string, HostMethodSpec>();
  private readonly registered: HostServiceModule[] = [];

  constructor(private readonly definitions: PermissionDefinitionRegistry) {
    super();
  }

  override register(module: HostServiceModule): void {
    for (const method of module.methods) {
      if (this.methods.has(method.name)) {
        throw new Error(`duplicate host method '${method.name}'`);
      }
      this.methods.set(method.name, method);
    }
    this.registered.push(module);
  }

  override lookup(namespace: string, method: string): HostMethodSpec | undefined {
    return this.methods.get(`${namespace}.${method}`);
  }

  override modules(): readonly HostServiceModule[] {
    return [...this.registered];
  }

  override validateBoot(): readonly HostServiceViolation[] {
    const violations: HostServiceViolation[] = [];
    for (const module of this.registered) {
      for (const method of module.methods) {
        if (!method.params || !method.result) {
          violations.push({
            namespace: module.namespace,
            method: method.name,
            code: 'missing_schema',
          });
        }
        if (method.permission !== null && !this.definitions.get(method.permission)) {
          violations.push({
            namespace: module.namespace,
            method: method.name,
            code: 'unknown_permission',
          });
        }
      }
    }
    return violations;
  }
}
