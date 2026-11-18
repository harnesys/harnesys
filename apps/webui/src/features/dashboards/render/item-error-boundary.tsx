import { Component, type ReactNode } from 'react';

export interface ItemErrorBoundaryProps {
  itemId: string;
  /** Changing value clears the captured error, so a fixed item recovers without a remount. */
  resetKey?: string;
  children: ReactNode;
}

interface ItemErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains a throwing primitive to its own grid cell: React unwinds to the
 * nearest boundary, so siblings keep rendering. Class component because error
 * boundaries have no hook equivalent.
 */
export class ItemErrorBoundary extends Component<ItemErrorBoundaryProps, ItemErrorBoundaryState> {
  state: ItemErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ItemErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ItemErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    const { itemId, children } = this.props;
    if (!error) {
      return children;
    }
    return (
      <div
        className="flex h-full w-full flex-col justify-center gap-1 overflow-auto rounded-lg border border-destructive/40 bg-destructive/5 p-2"
        data-testid={`widget-item-error-${itemId}`}
      >
        <div className="truncate font-medium text-destructive text-xs">Item {itemId} failed</div>
        <div className="text-muted-foreground text-xs">{error.message || String(error)}</div>
      </div>
    );
  }
}
