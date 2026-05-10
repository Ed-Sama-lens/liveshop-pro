'use client';

import { useEffect } from 'react';

export default function GlobalErrorCapture() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Import dynamically to avoid SSR issues
      import('@/lib/logger/client-logger').then(({ clientLogger }) => {
        clientLogger.error('Unhandled error', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }, event.error);
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      import('@/lib/logger/client-logger').then(({ clientLogger }) => {
        const errorMessage = event.reason instanceof Error ? event.reason.message : String(event.reason);
        clientLogger.error('Unhandled promise rejection', {
          reason: errorMessage,
        }, event.reason instanceof Error ? event.reason : undefined);
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
