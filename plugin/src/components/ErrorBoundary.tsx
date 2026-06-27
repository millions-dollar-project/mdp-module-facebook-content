/**
 * ErrorBoundary — minimal React error boundary for the Brain panels.
 *
 * Without this, any uncaught render error (e.g. undefined[0] from a
 * shape mismatch between backend JSON and TS types) tears down the
 * whole plugin tree and the user sees a blank pane with no clue what
 * went wrong. Wrapping BrainFeedTab and the dashboard panels gives us
 * a visible error card + a Reload button instead.
 */
import React from 'react';
import { Card } from './Card';

interface Props {
  children: React.ReactNode;
  /** Optional label so multiple boundaries in the same tree are distinguishable in logs. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface to console so DevTools shows the stack; keep this simple
    // — no remote reporting yet.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Card padded data-testid="error-boundary">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 600, color: 'var(--ds-danger, #ef4444)' }}>
              Đã có lỗi khi hiển thị{this.props.label ? ` ${this.props.label}` : ''}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ds-text-muted)',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 160,
                overflow: 'auto',
                background: 'var(--bg-elevated)',
                padding: 8,
                borderRadius: 4,
              }}
            >
              {this.state.error.message}
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={this.handleReload}
              style={{ alignSelf: 'flex-start' }}
            >
              Thử lại
            </button>
          </div>
        </Card>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;