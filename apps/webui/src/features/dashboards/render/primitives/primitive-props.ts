export type PrimitiveEmit = (event: string, payload?: unknown) => void;

/**
 * Contract every primitive component implements. Values arrive already bound
 * to `props`; user gestures leave through `emit` and never reach the doc.
 */
export interface PrimitiveComponentProps {
  props: Record<string, unknown>;
  emit: PrimitiveEmit;
}
