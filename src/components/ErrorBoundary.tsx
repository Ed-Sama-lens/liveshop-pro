'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 'page' shows a full-page fallback with a reload button.
   *  'section' shows a smaller inline card fallback. */
  level?: 'page' | 'section';
  /** Optional custom fallback to override the default UI. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

const INITIAL_STATE: ErrorBoundaryState = { hasError: false, error: null };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static defaultProps: Partial<ErrorBoundaryProps> = { level: 'page' };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = INITIAL_STATE;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    clientLogger.error('React ErrorBoundary caught error', {
      componentStack: info.componentStack ?? undefined,
      errorMessage: error.message,
    }, error);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState(INITIAL_STATE);
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, level = 'page', fallback } = this.props;

    if (!hasError) return children;

    if (fallback !== undefined) return fallback;

    if (level === 'section') {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">Something went wrong in this section.</p>
          <button
            onClick={this.handleReset}
            className="mt-2 underline underline-offset-2 hover:no-underline"
          >
            Try again
          </button>
        </div>
      );
    }

    // level === 'page'
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        {error && (
          <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
        )}
        <button
          onClick={this.handleReload}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reload page
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
