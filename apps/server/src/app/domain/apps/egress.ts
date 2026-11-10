export interface EgressUserHost {
  field: string;
  suffixes?: string[];
  allowPrivate: boolean;
}

export interface EgressPolicy {
  hosts: string[];
  userHost?: EgressUserHost;
}
