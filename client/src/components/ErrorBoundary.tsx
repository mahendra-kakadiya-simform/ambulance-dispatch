import { Alert, AlertTitle, Box, Button } from '@mui/material';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Catches render errors so one broken screen shows a message instead of a blank app.
// AppLayout keys it by route, so navigating elsewhere clears the error.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Box sx={{ p: 3, maxWidth: 640 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                Reload
              </Button>
            }
          >
            <AlertTitle>Something went wrong on this screen</AlertTitle>
            {this.state.error.message}
          </Alert>
        </Box>
      );
    }
    return this.props.children;
  }
}
