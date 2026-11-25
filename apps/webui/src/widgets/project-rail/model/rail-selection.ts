import { SIDEBAR_RAIL_SECTION_STORAGE_KEY } from '@/shared/config/constants';
import { SECTION_META, type SidebarSectionId } from '@/widgets/project-sidebar';

export function isRailSectionId(value: string | null | undefined): value is SidebarSectionId {
  return value !== null && value !== undefined && Object.hasOwn(SECTION_META, value);
}

export function loadRailSection(): SidebarSectionId | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_RAIL_SECTION_STORAGE_KEY);
    return isRailSectionId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveRailSection(id: SidebarSectionId): void {
  try {
    localStorage.setItem(SIDEBAR_RAIL_SECTION_STORAGE_KEY, id);
  } catch {
    return;
  }
}
