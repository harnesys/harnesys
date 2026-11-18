import type {
  CreateDashboardBody,
  DashboardsCatalogResponse,
  DashboardWidget,
  JsonValue,
  UpdateDashboardBody,
  UpdateLayoutBody,
  UpdateWidgetBody,
} from '@harnesys/contracts';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, apiJson } from '@/shared/api/client';
import {
  activateDashboardWidget,
  addDashboardWidget,
  createDashboard,
  type DashboardsChangedFrame,
  dashboardsBase,
  deleteDashboard,
  deleteDashboardWidget,
  getDashboard,
  listDashboards,
  parseDashboardsChangedFrame,
  updateDashboard,
  updateDashboardLayout,
} from '@/shared/api/dashboards';
import { eventsWatchUrl } from '@/shared/api/events';
import { watchEventSource } from '@/shared/api/sse';

const DASHBOARDS_ROOT_KEY = ['dashboards'] as const;

export function dashboardsListQueryKey(orgId: string) {
  return [...DASHBOARDS_ROOT_KEY, 'list', orgId] as const;
}

export function dashboardDetailQueryKey(orgId: string, dashboardId: string) {
  return [...DASHBOARDS_ROOT_KEY, 'detail', orgId, dashboardId] as const;
}

export function widgetStateQueryKey(orgId: string, dashboardId: string, widgetId: string) {
  return [...DASHBOARDS_ROOT_KEY, 'widget-state', orgId, dashboardId, widgetId] as const;
}

export interface WidgetStateSnapshot {
  state: Record<string, JsonValue>;
}

function widgetStateUrl(orgId: string, dashboardId: string, widgetId: string): string {
  return `${dashboardsBase(orgId)}/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}/state`;
}

export function widgetStateQuery(orgId: string, dashboardId: string, widgetId: string) {
  return queryOptions({
    queryKey: widgetStateQueryKey(orgId, dashboardId, widgetId),
    queryFn: () => apiJson<WidgetStateSnapshot>(widgetStateUrl(orgId, dashboardId, widgetId)),
    enabled: Boolean(orgId) && Boolean(dashboardId) && Boolean(widgetId),
    staleTime: Infinity,
  });
}

export function usePutWidgetState(orgId: string, dashboardId: string, widgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (state: Record<string, JsonValue>) =>
      apiJson<WidgetStateSnapshot>(widgetStateUrl(orgId, dashboardId, widgetId), {
        method: 'PUT',
        body: JSON.stringify({ state }),
      }),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(widgetStateQueryKey(orgId, dashboardId, widgetId), snapshot);
    },
  });
}

/** Persisted values of a widget plus the write-through used by the runtime. */
export function useWidgetPersistedState(
  orgId: string,
  dashboardId: string,
  widgetId: string,
  keys: string[] | undefined,
) {
  const query = useQuery({
    ...widgetStateQuery(orgId, dashboardId, widgetId),
    enabled: Boolean(orgId) && Boolean(widgetId) && (keys?.length ?? 0) > 0,
  });
  const put = usePutWidgetState(orgId, dashboardId, widgetId);
  return {
    values: query.data?.state ?? {},
    write: (state: Record<string, JsonValue>) => put.mutate(state),
  };
}

export function dashboardsCatalogQueryKey(orgId: string) {
  return [...DASHBOARDS_ROOT_KEY, 'catalog', orgId] as const;
}

export function dashboardsCatalogQuery(orgId: string) {
  return queryOptions({
    queryKey: dashboardsCatalogQueryKey(orgId),
    queryFn: () => apiJson<DashboardsCatalogResponse>(`${dashboardsBase(orgId)}/catalog`),
    enabled: Boolean(orgId),
    staleTime: Infinity,
  });
}

export function dashboardsListQuery(orgId: string) {
  return queryOptions({
    queryKey: dashboardsListQueryKey(orgId),
    queryFn: () => listDashboards(orgId),
    enabled: Boolean(orgId),
  });
}

export function dashboardDetailQuery(orgId: string, dashboardId: string) {
  return queryOptions({
    queryKey: dashboardDetailQueryKey(orgId, dashboardId),
    queryFn: () => getDashboard(orgId, dashboardId),
    enabled: Boolean(orgId) && Boolean(dashboardId),
  });
}

export function useDashboardsMutationInvalidator(orgId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [...DASHBOARDS_ROOT_KEY, 'list', orgId] });
    void queryClient.invalidateQueries({
      queryKey: [...DASHBOARDS_ROOT_KEY, 'detail', orgId],
    });
  };
}

export function useCreateDashboard(orgId: string) {
  const invalidate = useDashboardsMutationInvalidator(orgId);
  return useMutation({
    mutationFn: (body: CreateDashboardBody) => createDashboard(orgId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateDashboard(orgId: string, dashboardId: string) {
  const invalidate = useDashboardsMutationInvalidator(orgId);
  return useMutation({
    mutationFn: (body: UpdateDashboardBody) => updateDashboard(orgId, dashboardId, body),
    onSuccess: invalidate,
  });
}

export function useDeleteDashboard(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dashboardId: string) => deleteDashboard(orgId, dashboardId),
    onSuccess: (_data, deletedId) => {
      void queryClient.invalidateQueries({ queryKey: dashboardsListQueryKey(orgId) });
      void queryClient.removeQueries({
        queryKey: dashboardDetailQueryKey(orgId, deletedId),
      });
    },
  });
}

export function useAddDashboardWidget(orgId: string, dashboardId: string) {
  const invalidate = useDashboardsMutationInvalidator(orgId);
  return useMutation({
    mutationFn: (body: UpdateWidgetBody) => addDashboardWidget(orgId, dashboardId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateDashboardWidget(orgId: string, dashboardId: string) {
  const invalidate = useDashboardsMutationInvalidator(orgId);
  return useMutation({
    mutationFn: (input: { widgetId: string; body: UpdateWidgetBody; baseUpdatedAt?: string }) =>
      apiJson<DashboardWidget>(
        `${dashboardsBase(orgId)}/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(input.widgetId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...input.body,
            ...(input.baseUpdatedAt ? { baseUpdatedAt: input.baseUpdatedAt } : {}),
          }),
        },
      ),
    onSuccess: invalidate,
  });
}

/** The server rejected a save because the widget changed after the draft started. */
export function isWidgetConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export function useDeleteDashboardWidget(orgId: string, dashboardId: string) {
  const invalidate = useDashboardsMutationInvalidator(orgId);
  return useMutation({
    mutationFn: (widgetId: string) => deleteDashboardWidget(orgId, dashboardId, widgetId),
    onSuccess: invalidate,
  });
}

export function useActivateDashboardWidget(orgId: string, dashboardId: string) {
  const invalidate = useDashboardsMutationInvalidator(orgId);
  return useMutation({
    mutationFn: (widgetId: string) => activateDashboardWidget(orgId, dashboardId, widgetId),
    onSuccess: invalidate,
  });
}

export function useUpdateDashboardLayout(orgId: string, dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateLayoutBody) => updateDashboardLayout(orgId, dashboardId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: dashboardDetailQueryKey(orgId, dashboardId),
      });
    },
  });
}

/**
 * Subscribe to `dashboards.changed` SSE frames and refresh what the frame
 * carries. A widget-state frame updates the cached snapshot in place: state is
 * pushed, never refetched, and it never invalidates the dashboard itself.
 */
export function useDashboardsChangedSync(orgId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!orgId) {
      return;
    }
    const invalidateDetail = (dashboardId: string) => {
      void queryClient.invalidateQueries({
        queryKey: dashboardDetailQueryKey(orgId, dashboardId),
      });
    };
    const onChange = (frame: DashboardsChangedFrame) => {
      if (frame.reason === 'widget.state') {
        if (frame.dashboardId && frame.widgetId && frame.state) {
          queryClient.setQueryData<WidgetStateSnapshot>(
            widgetStateQueryKey(orgId, frame.dashboardId, frame.widgetId),
            { state: frame.state },
          );
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: [...DASHBOARDS_ROOT_KEY, 'widget-state', orgId],
        });
        return;
      }
      if (frame.dashboardId) {
        invalidateDetail(frame.dashboardId);
        void queryClient.invalidateQueries({ queryKey: dashboardsListQueryKey(orgId) });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: [...DASHBOARDS_ROOT_KEY, orgId] });
    };
    return watchEventSource(
      eventsWatchUrl,
      'dashboards.changed',
      (data) => {
        const frame = parseDashboardsChangedFrame(data);
        if (frame && (!frame.orgId || frame.orgId === orgId)) {
          onChange(frame);
        }
      },
      { orgId },
    );
  }, [orgId, queryClient]);
}
