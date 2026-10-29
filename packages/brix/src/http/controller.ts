import 'reflect-metadata';

export const controllerPrefixKey = 'http:controller-prefix';

export function Controller(prefix?: string): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(controllerPrefixKey, prefix ?? '', target);
  };
}
