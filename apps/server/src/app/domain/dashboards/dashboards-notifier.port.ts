export abstract class DashboardsNotifierPort {
  abstract changed(
    orgId: string,
    dashboardId: string,
    reason: string,
    payload?: Record<string, unknown>,
  ): void;
}
