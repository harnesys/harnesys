import 'reflect-metadata';
import type { UnknownClass } from '../di/injectable';

export const APP_GUARD = 'APP_GUARD';

export const IS_PUBLIC_KEY = 'guards:is-public';

const guardsKey = 'guards:use-guards';

export function Public(): MethodDecorator & ClassDecorator {
  return (target: object, propertyKey?: string | symbol) => {
    if (propertyKey === undefined) {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
    } else {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, target, propertyKey);
    }
  };
}

export function UseGuards(...guards: UnknownClass[]): MethodDecorator & ClassDecorator {
  return (target: object, propertyKey?: string | symbol) => {
    if (propertyKey === undefined) {
      const existing = (Reflect.getMetadata(guardsKey, target) as UnknownClass[] | undefined) ?? [];
      Reflect.defineMetadata(guardsKey, [...existing, ...guards], target);
    } else {
      const existing =
        (Reflect.getMetadata(guardsKey, target, propertyKey) as UnknownClass[] | undefined) ?? [];
      Reflect.defineMetadata(guardsKey, [...existing, ...guards], target, propertyKey);
    }
  };
}

export function isPublic(controller: UnknownClass, handlerName: string): boolean {
  const prototype = controller.prototype as object;
  if (Reflect.getMetadata(IS_PUBLIC_KEY, prototype, handlerName) === true) {
    return true;
  }
  return Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
}

export function getGuardClasses(controller: UnknownClass, handlerName: string): UnknownClass[] {
  const prototype = controller.prototype as object;
  const fromClass =
    (Reflect.getMetadata(guardsKey, controller) as UnknownClass[] | undefined) ?? [];
  const fromMethod =
    (Reflect.getMetadata(guardsKey, prototype, handlerName) as UnknownClass[] | undefined) ?? [];
  return [...fromClass, ...fromMethod];
}
