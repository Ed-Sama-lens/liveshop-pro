'use client';

/**
 * /sale — Live Sale admin shell (Commit 2L-a — thin shell only).
 *
 * Read-only page for live-selling booking + order operations. NO mutation
 * calls in this commit; buttons are disabled placeholders. Backend
 * runtime + routes already exist (Commits 2B/2E/2H/2I/2M-b/2M-c/2N/2N-HARDENING)
 * but UI wiring is deferred to a later commit (2O) so this shell can ship
 * without authenticated mutation testing.
 *
 * Auth gate is enforced by middleware via permissions.ts:
 *   { prefix: '/sale', roles: ['OWNER','MANAGER','CHAT_SUPPORT'] }
 *
 * Mutation routes still require OWNER/MANAGER at the API layer; CHAT_SUPPORT
 * has page-level read access only (per RBAC §9 in 2026-04-06-sale-mvp-dissent.md).
 *
 * Hard rule for this commit: do NOT call any of these:
 *   POST /api/sale/bookings
 *   POST /api/sale/bookings/[id]/confirm
 *   POST /api/sale/bookings/[id]/cancel
 *   POST /api/sale/orders/from-bookings
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorBoundarySection } from '@/components/ErrorBoundarySection';
import {
  Radio,
  Grid3x3,
  Users,
  ShoppingCart,
  MessageSquare,
  Construction,
} from 'lucide-react';

export default function SalePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live Sale / ขายผ่านไลฟ์</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          จัดการสินค้า จองสินค้า และสร้างออเดอร์จากไลฟ์
        </p>
      </div>

      {/* Test-mode banner */}
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40">
        <CardContent className="flex items-start gap-3 py-4">
          <Construction className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              ระยะทดสอบ: หน้านี้ยังไม่ส่งคำสั่งจริง
            </p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
              Backend APIs are live but UI mutation wiring is deferred to a later commit.
              All buttons on this page are placeholders.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Workspace cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ErrorBoundarySection>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Live Sessions / รอบไลฟ์</CardTitle>
              <Radio className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                เลือกรอบไลฟ์ที่กำลังขายอยู่เพื่อเริ่มจัดการการจอง
              </p>
              <Button variant="outline" size="sm" disabled>
                ยังไม่เปิดใช้งาน
              </Button>
            </CardContent>
          </Card>
        </ErrorBoundarySection>

        <ErrorBoundarySection>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Product Codes / รหัสสินค้า</CardTitle>
              <Grid3x3 className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                ตารางรหัสสินค้า (เช่น A001, B002) สำหรับการจองและสร้างออเดอร์เร็ว
              </p>
              <Button variant="outline" size="sm" disabled>
                ยังไม่เปิดใช้งาน
              </Button>
            </CardContent>
          </Card>
        </ErrorBoundarySection>

        <ErrorBoundarySection>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Customer Bookings / รายการจอง</CardTitle>
              <Users className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                รายการจองสินค้าตามลูกค้า แยกตามสถานะ pending review / confirmed
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Pending Review</Badge>
                <Badge variant="outline">Confirmed</Badge>
                <Badge variant="outline">Converted</Badge>
              </div>
              <Button variant="outline" size="sm" disabled>
                ยังไม่เปิดใช้งาน
              </Button>
            </CardContent>
          </Card>
        </ErrorBoundarySection>

        <ErrorBoundarySection>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Create Order / สร้างออเดอร์</CardTitle>
              <ShoppingCart className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                รวมรายการจอง CONFIRMED ของลูกค้าหนึ่งคนใน 1 รอบไลฟ์ให้กลายเป็น 1 ออเดอร์
              </p>
              <Button variant="outline" size="sm" disabled>
                ยังไม่เปิดใช้งาน
              </Button>
            </CardContent>
          </Card>
        </ErrorBoundarySection>

        <ErrorBoundarySection>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Inbox (Coming Soon)</CardTitle>
              <MessageSquare className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Unified inbox สำหรับ Messenger / WhatsApp / Telegram / Live comments — เฟสถัดไป
              </p>
              <Button variant="outline" size="sm" disabled>
                Coming soon
              </Button>
            </CardContent>
          </Card>
        </ErrorBoundarySection>
      </div>
    </div>
  );
}
