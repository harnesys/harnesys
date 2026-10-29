import type { WindowDesksByOrg } from '@harnesys/studio-shared';

export interface WindowDesksResponse {
  desks: WindowDesksByOrg;
}

export function getWindowDesk(): Promise<WindowDesksResponse> {
  return Promise.resolve({ desks: {} });
}

export function putWindowDesk(desks: WindowDesksByOrg): Promise<WindowDesksByOrg> {
  return Promise.resolve(desks);
}
