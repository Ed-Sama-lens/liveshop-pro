import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorBoundarySection } from '@/components/ErrorBoundarySection';
import { SaleSessionPickerPlaceholder } from './SaleSessionPickerPlaceholder';
import { SaleProductGridPlaceholder } from './SaleProductGridPlaceholder';
import { SaleBookingQueuePlaceholder } from './SaleBookingQueuePlaceholder';
import { SaleCustomerPanelPlaceholder } from './SaleCustomerPanelPlaceholder';
import { SaleOrderConversionPlaceholder } from './SaleOrderConversionPlaceholder';
import { SaleInboxPlaceholder } from './SaleInboxPlaceholder';

/**
 * /sale workspace shell (Commit 2L-b).
 *
 * Composes 6 read-only placeholder panels into a responsive grid. Every
 * panel is wrapped in ErrorBoundarySection so a future runtime fault
 * in one section can't blank the whole workspace.
 *
 * Strict no-mutation contract:
 * - no fetch() calls
 * - no router.push() from action buttons
 * - all buttons are <Button disabled>
 * - no client-side state machines that could trip into a real mutation
 *
 * Server-state wiring lands in 2O (booking management) after authenticated
 * smoke pattern is decided.
 */
export function SaleWorkspaceShell() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Live Sale / ขายผ่านไลฟ์</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          จัดการสินค้า จองสินค้า และสร้างออเดอร์จากไลฟ์
        </p>
      </header>

      <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40">
        <CardContent className="flex items-start gap-3 py-4">
          <Construction className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              ระยะทดสอบ: หน้านี้ยังไม่ส่งคำสั่งจริง
            </p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
              Backend APIs are live (create / confirm / cancel / convert) but UI mutation
              wiring is deferred. All controls on this page are static placeholders.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ErrorBoundarySection>
          <SaleSessionPickerPlaceholder />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleProductGridPlaceholder />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleBookingQueuePlaceholder />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleCustomerPanelPlaceholder />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleOrderConversionPlaceholder />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleInboxPlaceholder />
        </ErrorBoundarySection>
      </div>
    </div>
  );
}
