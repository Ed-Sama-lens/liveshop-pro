import { type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';

/**
 * Re-export renderHook for convenience so hook tests can import from one place.
 */
export { renderHook };

/**
 * Simple passthrough wrapper — provided as a base for tests that need a
 * React context boundary without a full provider tree.
 */
export function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <>{children}</>;
  };
}
