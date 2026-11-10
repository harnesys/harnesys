import { toast } from '@/shared/ui/toast';
import type { AddonRouteRef, SectionL10n } from './view-sections';

export interface SectionCallResult {
  toast?: string;
  refresh?: boolean;
}

export function resolveL10nText(value: SectionL10n | undefined): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return value.en ?? Object.values(value)[0] ?? '';
}

export function routeParamsOf(
  ref: AddonRouteRef,
  row?: Record<string, unknown>,
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(ref.params ?? {})) {
    params[key] = value;
  }
  if (!row) {
    return params;
  }
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' || typeof value === 'number') {
      params[key] = String(value);
    }
  }
  return params;
}

export function handleSectionResult(result: unknown, onRefresh: () => void): void {
  if (!isSectionResult(result)) {
    return;
  }
  if (result.toast) {
    toast.add({ type: 'info', title: result.toast });
  }
  if (result.refresh) {
    onRefresh();
  }
}

function isSectionResult(value: unknown): value is SectionCallResult {
  return typeof value === 'object' && value !== null;
}
