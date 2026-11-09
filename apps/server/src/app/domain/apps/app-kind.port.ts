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

export interface AccountKindDescriptor {
  kind: string;
  label: string;
  description: string;
  fields: AppFieldDescriptor[];
}

export abstract class AppKindProviderPort {
  abstract descriptor(): AppKindDescriptor;

  abstract accountKinds(): AccountKindDescriptor[];
}

export abstract class AppKindRegistryPort {
  abstract list(): AppKindDescriptor[];

  abstract find(kind: string): AppKindDescriptor | null;

  abstract require(kind: string): AppKindDescriptor;

  abstract providerOf(kind: string): AppKindProviderPort | null;

  abstract requireProvider(kind: string): AppKindProviderPort;

  abstract accountKinds(): AccountKindDescriptor[];

  abstract accountDescriptor(kind: string): AccountKindDescriptor | null;

  abstract requireAccountDescriptor(kind: string): AccountKindDescriptor;
}
