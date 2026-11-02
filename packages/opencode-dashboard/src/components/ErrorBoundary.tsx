'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });

    // Log error to console
    console.error(`[ErrorBoundary] ${this.props.componentName || 'Component'} crashed:`, error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '20px',
          margin: '10px',
          border: '1px solid #dc2626',
          borderRadius: '8px',
          backgroundColor: '#fef2f2',
          color: '#991b1b'
        }}>
          <h2 style={{ marginTop: 0, color: '#dc2626' }}>
            ⚠️ {this.props.componentName || 'Component'} Error
          </h2>
          <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
          {process.env.NODE_ENV === 'development' && this.state.error?.stack && (
            <details style={{ marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '10px' }}>
                Show error details
              </summary>
              <pre style={{
                overflow: 'auto',
                padding: '10px',
                backgroundColor: '#fee2e2',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Simple hook for functional components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => (
    <ErrorBoundary componentName={componentName}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${componentName || Component.name})`;
  return WrappedComponent;
}
