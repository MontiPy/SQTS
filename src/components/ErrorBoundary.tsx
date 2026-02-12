import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
          <div className="max-w-md w-full mx-4 p-6 rounded-lg border border-border bg-card shadow-lg">
            <div className="flex flex-col items-center text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>

              <div className="flex gap-3">
                <Button onClick={() => window.location.reload()}>
                  Reload App
                </Button>
                <Button
                  variant="outline"
                  onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                >
                  {this.state.showDetails ? 'Hide Details' : 'Show Details'}
                </Button>
              </div>

              {this.state.showDetails && this.state.errorInfo && (
                <pre className="mt-4 w-full text-left text-xs bg-muted p-3 rounded-md overflow-auto max-h-48 text-muted-foreground">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
