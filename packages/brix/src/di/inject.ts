import 'reflect-metadata';

export const injectTokensKey = 'di:inject-tokens';

export function Inject(token?: unknown): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey !== undefined) {
      throw new Error('@Inject() supports constructor parameters only');
    }
    const existing =
      (Reflect.getMetadata(injectTokensKey, target) as Array<unknown> | undefined) ?? [];
    const tokens = [...existing];
    tokens[parameterIndex] = token;
    Reflect.defineMetadata(injectTokensKey, tokens, target);
  };
}
