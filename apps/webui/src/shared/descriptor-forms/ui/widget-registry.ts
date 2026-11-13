import type { FieldSpec, FieldValue } from '@harnesys/contracts';
import type { ComponentType } from 'react';

/**
 * Client-side rich editors for `FieldSpec.widget.kind`. The descriptor form
 * API stays declarative: an addon declares a widget kind, the host resolves it
 * in this registry. Unknown kinds fall back to the base type renderer, so a
 * form never breaks when the client lacks a widget.
 */
export interface FormWidgetProps {
  field: FieldSpec;
  value: FieldValue | undefined;
  disabled: boolean;
  onChange: (value: FieldValue) => void;
}

export type FormWidget = ComponentType<FormWidgetProps>;

const registry = new Map<string, FormWidget>();

export function registerFormWidget(kind: string, widget: FormWidget): void {
  registry.set(kind, widget);
}

export function formWidget(kind: string | undefined): FormWidget | undefined {
  return kind ? registry.get(kind) : undefined;
}
