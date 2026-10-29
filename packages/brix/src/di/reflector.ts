import 'reflect-metadata';
import type { UnknownClass } from './injectable';

const metadataPrefix = 'core:metadata:';

export function SetMetadata(key: string, value: unknown): MethodDecorator & ClassDecorator {
  return (target: object, propertyKey?: string | symbol) => {
    const metadataKey = metadataPrefix + key;
    if (propertyKey === undefined) {
      Reflect.defineMetadata(metadataKey, value, target);
    } else {
      Reflect.defineMetadata(metadataKey, value, target, propertyKey);
    }
  };
}

function collectValues<T>(value: unknown): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

export class Reflector {
  get<T>(key: string, controller: UnknownClass, handlerName?: string): T | undefined {
    const metadataKey = metadataPrefix + key;
    if (handlerName !== undefined) {
      const methodValue = Reflect.getMetadata(metadataKey, controller.prototype, handlerName) as
        | T
        | undefined;
      if (methodValue !== undefined) {
        return methodValue;
      }
    }
    return Reflect.getMetadata(metadataKey, controller) as T | undefined;
  }

  getAll<T>(key: string, controller: UnknownClass, handlerName?: string): T[] {
    const metadataKey = metadataPrefix + key;
    const fromClass = collectValues<T>(Reflect.getMetadata(metadataKey, controller));
    const fromMethod =
      handlerName === undefined
        ? []
        : collectValues<T>(Reflect.getMetadata(metadataKey, controller.prototype, handlerName));
    return [...fromClass, ...fromMethod];
  }
}
