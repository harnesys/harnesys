import type { AddonConnectionView, FieldSpec, FieldValue } from '@harnesys/contracts';
import type { ComponentType } from 'react';

/**
 * Client-side rich editors for `FieldSpec.widget.kind`. The descriptor form
 * API stays declarative: an addon declares a widget kind, the host resolves it
 * in this registry. Unknown kinds fall back to the base type renderer, so a
 * form never breaks when the client lacks a widget.
 */
export interface AddonFormContext {
  orgId: string;
  addonId: string;
  /** Connection views of the add-on, used by `optionsFrom: connections`. */
  connections: readonly AddonConnectionView[];
}

export interface FormWidgetProps {
  field: FieldSpec;
  value: FieldValue | undefined;
  disabled: boolean;
  onChange: (value: FieldValue) => void;
  /** Whole form values: widgets resolve `optionsFrom.dependsOn` from them. */
  values: Record<string, FieldValue>;
  /** Add-on identity; widgets degrade to manual entry when it is missing. */
  addon?: AddonFormContext;
}

export type FormWidget = ComponentType<FormWidgetProps>;

/** DOM id of a field's control; label and a11y bindings key off it. */
export function fieldControlId(key: string): string {
  return `field-${key}`;
}

const registry = new Map<string, FormWidget>();

export function registerFormWidget(kind: string, widget: FormWidget): void {
  registry.set(kind, widget);
}

export function formWidget(kind: string | undefined): FormWidget | undefined {
  return kind ? registry.get(kind) : undefined;
}
