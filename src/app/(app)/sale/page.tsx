/**
 * /sale — Live Sale admin workspace (Commit 2L-b — read-only skeleton).
 *
 * Composes the SaleWorkspaceShell which renders 6 read-only placeholder
 * panels. NO mutation calls. NO data fetch. Backend runtime + routes
 * shipped in Commits 2B / 2E / 2H / 2I / 2M-b / 2M-c / 2N / 2N-HARDENING
 * are NOT invoked from this UI yet.
 *
 * Auth gate enforced by middleware via src/lib/auth/permissions.ts:
 *   { prefix: '/sale', roles: ['OWNER','MANAGER','CHAT_SUPPORT'] }
 *
 * Server component by default; SaleWorkspaceShell is also pure server-
 * compatible (no useState/useEffect/event handlers).
 *
 * Strict no-mutation contract for 2L-b. The actual wiring lives in
 * Commit 2O once authenticated smoke harness is in place.
 */

import { SaleWorkspaceShell } from '@/components/sale/SaleWorkspaceShell';

export default function SalePage() {
  return <SaleWorkspaceShell />;
}
