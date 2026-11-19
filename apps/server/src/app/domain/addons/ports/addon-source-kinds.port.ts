export interface AddonSourceKindView {
  addonId: string;
  id: string;
  title: string;
  connection?: string;
  mount: 'cloud' | 'git';
  supportsRootMount?: boolean;
  supportsSearch?: boolean;
  rootTitle?: string;
}

export abstract class AddonSourceKindsPort {
  abstract list(orgId: string): AddonSourceKindView[];

  abstract find(orgId: string, addonId: string, id: string): AddonSourceKindView | undefined;
}
