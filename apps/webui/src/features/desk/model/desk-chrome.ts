import type { PersistedIdeWorkspace, WindowDesk, WindowDesksByOrg } from '@harnesys/studio-shared';
import { type DeskChromeStorage, readDeskChrome, writeDeskChrome } from './desk-chrome-storage';

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
let hydratedOrgId: string | null = null;
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
    flushPersistDeskChrome();
  }, 300);
}
export function flushPersistDeskChrome(): void {
  if (!ready || !activeOrgId) {
    return;
  }
  const storage = deskStorage();
  if (!storage) {
    return;
  }
  const orgId = activeOrgId;
  desksCache = { ...desksCache, [orgId]: currentDesk() };
  writeDeskChrome(storage, desksCache);
}
function deskStorage(): DeskChromeStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
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
  if (hydratedOrgId !== orgId) {
    const desk = desksCache[orgId] ?? emptyDeskSlice();
    workspaceWriter(desk.workspace);
    hydratedOrgId = orgId;
  }
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
  const storage = deskStorage();
  if (storage) {
    desksCache = readDeskChrome(storage);
  }
  desksLoaded = true;
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flushPersistDeskChrome());
}
