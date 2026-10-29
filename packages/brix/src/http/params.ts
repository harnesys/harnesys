import 'reflect-metadata';
import type { ZodType } from 'zod';
import type { BrixContext } from './context';

export type ParamKind = 'body' | 'param' | 'query' | 'ctx' | 'custom';

export interface ParamContext {
  request: Request;
  context: BrixContext;
}

export type ParamFactory = (data: unknown, context: ParamContext) => unknown | Promise<unknown>;

export interface ParamDef {
  index: number;
  kind: ParamKind;
  name?: string;
  schema?: ZodType;
  factory?: ParamFactory;
  data?: unknown;
}

export const paramsKey = 'http:params';

function requireMethodParam(
  owner: string,
  propertyKey: string | symbol | undefined,
): asserts propertyKey is string | symbol {
  if (propertyKey === undefined) {
    throw new Error(`${owner} supports controller method parameters only`);
  }
}

function pushParam(target: object, propertyKey: string | symbol, def: ParamDef): void {
  const existing = Reflect.getMetadata(paramsKey, target, propertyKey) as ParamDef[] | undefined;
  Reflect.defineMetadata(paramsKey, [...(existing ?? []), def], target, propertyKey);
}

function buildParam(index: number, kind: ParamKind, name?: string, schema?: ZodType): ParamDef {
  const def: ParamDef = { index, kind };
  if (name !== undefined) {
    def.name = name;
  }
  if (schema !== undefined) {
    def.schema = schema;
  }
  return def;
}

function defineParam(kind: ParamKind, name?: string, schema?: ZodType): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    requireMethodParam(`@${kind}()`, propertyKey);
    pushParam(target, propertyKey, buildParam(parameterIndex, kind, name, schema));
  };
}

export function createParamDecorator<TData>(
  factory: (data: TData | undefined, context: ParamContext) => unknown | Promise<unknown>,
): (data?: TData) => ParameterDecorator {
  return (data?: TData) => (target, propertyKey, parameterIndex) => {
    requireMethodParam('custom param decorator', propertyKey);
    const def: ParamDef = {
      index: parameterIndex,
      kind: 'custom',
      factory: factory as ParamFactory,
    };
    if (data !== undefined) {
      def.data = data;
    }
    pushParam(target, propertyKey, def);
  };
}

export function collapseQueryParams(
  queries: Record<string, string[]>,
): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = {};
  for (const key of Object.keys(queries)) {
    const values = queries[key];
    if (values === undefined) {
      continue;
    }
    const first = values[0];
    output[key] = values.length === 1 && first !== undefined ? first : values;
  }
  return output;
}

export function Body(schema?: ZodType): ParameterDecorator {
  return defineParam('body', undefined, schema);
}

export function Param(name?: string): ParameterDecorator {
  return defineParam('param', name);
}

export function Query(schema?: ZodType): ParameterDecorator {
  return defineParam('query', undefined, schema);
}

export function Ctx(): ParameterDecorator {
  return defineParam('ctx');
}

export function Req(): ParameterDecorator {
  return defineParam('ctx');
}
