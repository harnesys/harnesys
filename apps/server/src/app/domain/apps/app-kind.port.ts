export interface AppFieldDescriptor {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  multiline: boolean;
  placeholder: string;
}

export interface AppKindDescriptor {
  kind: string;
  label: string;
  description: string;
  fields: AppFieldDescriptor[];
}

export abstract class AppKindRegistryPort {
  abstract list(): AppKindDescriptor[];

  abstract find(kind: string): AppKindDescriptor | null;

  abstract require(kind: string): AppKindDescriptor;
}
