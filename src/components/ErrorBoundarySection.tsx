'use client';

import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface ErrorBoundarySectionProps {
  children: ReactNode;
}

/**
 * Lightweight wrapper around ErrorBoundary with level="section".
 * Use this to isolate individual dashboard widgets so one crash
 * does not bring down the entire page.
 */
export function ErrorBoundarySection({ children }: ErrorBoundarySectionProps) {
  return <ErrorBoundary level="section">{children}</ErrorBoundary>;
}

export default ErrorBoundarySection;
