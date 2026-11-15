declare module 'monaco-editor/editor/standalone/browser/standaloneServices.js' {
  export const StandaloneServices: {
    get<T>(service: new () => T): T;
  };
}
declare module 'monaco-editor/platform/configuration/common/configuration.js' {
  interface IConfigurationService {
    updateValues(values: Array<[string, unknown]>): boolean;
  }
  export const IConfigurationService: {
    new (): IConfigurationService;
  };
}
