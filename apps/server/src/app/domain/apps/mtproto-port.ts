export interface MtprotoApiAccess {
  apiId: number;
  apiHash: string;
  session?: string;
}

export interface MtprotoPhoneCode {
  phoneCodeHash: string;
}

export interface MtprotoUserProfile {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}

export type MtprotoSignInOutcome =
  | { status: 'done'; profile: MtprotoUserProfile }
  | { status: 'needsPassword' };

export interface MtprotoClient {
  connect(): Promise<void>;
  sendCode(phone: string): Promise<MtprotoPhoneCode>;
  signIn(phone: string, phoneCodeHash: string, code: string): Promise<MtprotoSignInOutcome>;
  signInWithPassword(password: string): Promise<MtprotoSignInOutcome>;
  me(): Promise<MtprotoUserProfile>;
  exportSessionString(): Promise<string>;
  close(): Promise<void>;
}

export abstract class MtprotoLoginPort {
  abstract client(api: MtprotoApiAccess): MtprotoClient;
  abstract probe(apiId: number, apiHash: string): Promise<number>;
  abstract probeSession(api: MtprotoApiAccess): Promise<MtprotoUserProfile>;
}
