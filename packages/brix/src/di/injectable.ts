import 'reflect-metadata';

export type UnknownClass = new (...args: never[]) => unknown;

const injectableKey = 'di:injectable';

export function Injectable(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(injectableKey, true, target);
  };
}

export function isInjectable(target: UnknownClass): boolean {
  return Reflect.getMetadata(injectableKey, target) === true;
}
