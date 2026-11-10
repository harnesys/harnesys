import { Injectable } from '@harnesys/brix';

export abstract class AddonHttpFetchPort {
  abstract fetch(url: URL, init: RequestInit): Promise<Response>;
}

@Injectable()
export class SystemAddonFetch extends AddonHttpFetchPort {
  fetch(url: URL, init: RequestInit): Promise<Response> {
    return fetch(url, init);
  }
}
