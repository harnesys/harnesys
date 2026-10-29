import 'reflect-metadata';
import type { UnknownClass } from '../di/injectable';
import { controllerPrefixKey } from './controller';
import type { ParamDef } from './params';
import { paramsKey } from './params';

export interface RouteDef {
  method: string;
  path: string;
  handlerName: string;
  params: ParamDef[];
  httpCode?: number;
}

interface StoredRoute {
  method: string;
  path: string;
}

const routeKey = 'http:route';
const httpCodeKey = 'http:http-code';

function createRouteDecorator(method: string, path?: string): MethodDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(
      routeKey,
      { method, path: path ?? '' } satisfies StoredRoute,
      target,
      propertyKey,
    );
  };
}

export function Get(path?: string): MethodDecorator {
  return createRouteDecorator('GET', path);
}

export function Post(path?: string): MethodDecorator {
  return createRouteDecorator('POST', path);
}

export function Patch(path?: string): MethodDecorator {
  return createRouteDecorator('PATCH', path);
}

export function Delete(path?: string): MethodDecorator {
  return createRouteDecorator('DELETE', path);
}

export function Put(path?: string): MethodDecorator {
  return createRouteDecorator('PUT', path);
}

export function HttpCode(code: number): MethodDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(httpCodeKey, code, target, propertyKey);
  };
}

export function joinPaths(...parts: Array<string | undefined>): string {
  const segments: string[] = [];
  for (const part of parts) {
    if (part === undefined || part === '') {
      continue;
    }
    for (const segment of part.split('/')) {
      if (segment !== '') {
        segments.push(segment);
      }
    }
  }
  return `/${segments.join('/')}`;
}

function collectMethodNames(prototype: object): string[] {
  const names: string[] = [];
  let current: object | null = prototype;
  while (current !== null && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name !== 'constructor' && !names.includes(name)) {
        names.push(name);
      }
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return names;
}

function byIndex(left: ParamDef, right: ParamDef): number {
  return left.index - right.index;
}

export function getRouteTable(controller: UnknownClass): RouteDef[] {
  const prefix = Reflect.getMetadata(controllerPrefixKey, controller) as string | undefined;
  const prototype = controller.prototype as object;
  const table: RouteDef[] = [];
  for (const name of collectMethodNames(prototype)) {
    const route = Reflect.getMetadata(routeKey, prototype, name) as StoredRoute | undefined;
    if (route === undefined) {
      continue;
    }
    const params = Reflect.getMetadata(paramsKey, prototype, name) as ParamDef[] | undefined;
    const httpCode = Reflect.getMetadata(httpCodeKey, prototype, name) as number | undefined;
    const def: RouteDef = {
      method: route.method,
      path: joinPaths(prefix, route.path),
      handlerName: name,
      params: [...(params ?? [])].sort(byIndex),
    };
    if (httpCode !== undefined) {
      def.httpCode = httpCode;
    }
    table.push(def);
  }
  return table;
}
