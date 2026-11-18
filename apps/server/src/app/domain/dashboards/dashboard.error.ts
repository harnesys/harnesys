import {
  BadRequestException,
  ConflictException,
  DomainException,
  EntityNotFoundException,
} from '@harnesys/brix';

export class DashboardNotFoundException extends EntityNotFoundException {
  constructor(dashboardId: string) {
    super(`dashboard not found: ${dashboardId}`, { dashboardId });
  }
}

export class DashboardWidgetNotFoundException extends EntityNotFoundException {
  constructor(widgetId: string) {
    super(`dashboard widget not found: ${widgetId}`, { widgetId });
  }
}

export class DashboardWidgetStatusException extends ConflictException {
  constructor(widgetId: string, status: string) {
    super(`widget ${widgetId} is already ${status}`, { widgetId, status });
  }
}

export class DashboardWidgetValidationException extends BadRequestException {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(`invalid widget doc: ${reason}`, details);
  }
}

export class DashboardWidgetConflictException extends DomainException {
  constructor(widgetId: string, expectedUpdatedAt: string, actualUpdatedAt: string) {
    super(
      'WIDGET_CONFLICT',
      `widget ${widgetId} changed on the server since the draft started`,
      { widgetId, expectedUpdatedAt, actualUpdatedAt },
      409,
    );
  }
}
