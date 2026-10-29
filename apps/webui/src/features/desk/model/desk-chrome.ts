import type { PersistedIdeWorkspace, WindowDesk, WindowDesksByOrg } from '@harnesys/studio-shared';
import { getWindowDesk, putWindowDesk } from '@/shared/api';

type WorkspaceReader = () => PersistedIdeWorkspace | null;
type WorkspaceWriter = (workspace: PersistedIdeWorkspace | null) => void;
let workspaceReader: WorkspaceReader = () => null;
let workspaceWriter: WorkspaceWriter = () => {};
const hydratePromises = new Map<string, Promise<void>>();
let desksCache: WindowDesksByOrg = {};
let desksLoaded = false;
let loadPromise: Promise<void> | null = null;
let activeOrgId: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let ready = false;
export function setDeskWorkspaceReader(reader: WorkspaceReader): void {
  workspaceReader = reader;
}
export function setDeskWorkspaceWriter(writer: WorkspaceWriter): void {
  workspaceWriter = writer;
}
export function hydrateDeskChrome(orgId: string): Promise<void> {
  const running = hydratePromises.get(orgId);
  if (running) {
    return running;
  }
  const task = runHydrate(orgId).finally(() => {
    if (hydratePromises.get(orgId) === task) {
      hydratePromises.delete(orgId);
    }
  });
  hydratePromises.set(orgId, task);
  return task;
}
export function schedulePersistDeskChrome(): void {
  if (!ready) {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersistDeskChrome();
  }, 300);
}
export async function flushPersistDeskChrome(): Promise<void> {
  if (!ready || !activeOrgId) {
    return;
  }
  const orgId = activeOrgId;
  desksCache = { ...desksCache, [orgId]: currentDesk() };
  try {
    desksCache = await putWindowDesk(desksCache);
  } catch {}
}
function currentDesk(): WindowDesk {
  return { workspace: workspaceReader() };
}
function emptyDeskSlice(): WindowDesk {
  return { workspace: null };
}
async function runHydrate(orgId: string): Promise<void> {
  activeOrgId = orgId;
  await ensureDesksLoaded();
  const desk = desksCache[orgId] ?? emptyDeskSlice();
  workspaceWriter(desk.workspace);
  ready = true;
}
async function ensureDesksLoaded(): Promise<void> {
  if (desksLoaded) {
    return;
  }
  if (!loadPromise) {
    loadPromise = loadDesks().finally(() => {
      loadPromise = null;
    });
  }
  await (loadPromise ?? Promise.resolve());
}
async function loadDesks(): Promise<void> {
  try {
    const response = await getWindowDesk();
    desksCache = response.desks ?? {};
  } catch {
    return;
  }
  desksLoaded = true;
}
