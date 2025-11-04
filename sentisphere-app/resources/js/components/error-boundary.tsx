import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
    };

    public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        // Update state so the next render will show the fallback UI
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="flex h-screen w-full flex-col items-center justify-center p-4 text-center">
                    <h2 className="mb-4 text-2xl font-bold text-destructive">Something went wrong</h2>
                    <p className="mb-6 text-muted-foreground">
                        We're sorry, but an unexpected error occurred. Please try refreshing the page.
                    </p>
                    <button
                        className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
                        onClick={() => window.location.reload()}
                    >
                        Refresh Page
                    </button>
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <details className="mt-4 max-w-full overflow-auto rounded-md bg-muted p-4 text-left">
                            <summary className="mb-2 cursor-pointer font-mono text-sm">Error Details</summary>
                            <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                {this.state.error.toString()}
                                {this.state.error.stack}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
