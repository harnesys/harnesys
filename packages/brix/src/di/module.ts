import 'reflect-metadata';
import type { Provider } from './container';
import type { UnknownClass } from './injectable';

export interface ModuleOptions {
  imports?: unknown[];
  controllers?: unknown[];
  providers?: Provider[];
  exports?: unknown[];
  global?: boolean;
}

export interface DynamicModule {
  module: UnknownClass;
  imports?: unknown[];
  controllers?: unknown[];
  providers?: Provider[];
  exports?: unknown[];
  global?: boolean;
}

const moduleKey = 'di:module';
const globalKey = 'di:global';

export function Module(options: ModuleOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(moduleKey, options, target);
  };
}

export function Global(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(globalKey, true, target);
  };
}

export function getModuleOptions(moduleRef: UnknownClass): ModuleOptions {
  return (Reflect.getMetadata(moduleKey, moduleRef) as ModuleOptions | undefined) ?? {};
}

export function isGlobalModule(moduleRef: UnknownClass): boolean {
  return (
    getModuleOptions(moduleRef).global === true ||
    Reflect.getMetadata(globalKey, moduleRef) === true
  );
}
