'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Loader2, Pin, PinOff, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buildPatchBody } from './edit-product-code.helpers';
import type { SaleBroadcastProductRow } from './SaleProductGridPlaceholder';

/**
 * EditProductCodeDialog — Tier 3.6 BroadcastProduct edit / delete UI.
 *
 * Surfaces the Tier 3.5 backend PATCH + DELETE routes:
 * - PATCH `/api/sale/broadcast-products/[id]` — priceOverride (string
 *   or null to clear) + isPinned + displayOrder. OWNER + MANAGER.
 * - DELETE `/api/sale/broadcast-products/[id]` — OWNER only, blocks
 *   with 409 when any non-EXPIRED Booking references the BP.
 *
 * Identity-bearing fields (displayCode / variantId / liveSessionId /
 * productId) are intentionally NOT editable here — they are immutable
 * at the repository layer too.
 *
 * Pure client component. No fetch on mount. Submits PATCH on Save,
 * DELETE on Delete. Calls onUpdated/onDeleted callback so parent can
 * refetch the product grid. Parent decides whether Delete button is
 * shown via the `canDelete` prop (OWNER-only).
 */

export interface EditProductCodeDialogProps {
  readonly product: SaleBroadcastProductRow;
  readonly canDelete: boolean;
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
  readonly onUpdated?: () => void;
  readonly onDeleted?: () => void;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'patching' }
  | { kind: 'deleting' }
  | { kind: 'error'; message: string };

export function EditProductCodeDialog({
  product,
  canDelete,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: EditProductCodeDialogProps) {
  // Initial values pulled from the row prop. Re-init on open via key
  // reset trick is avoided; parent unmounts/remounts on close so state
  // resets implicitly.
  const initialOverride =
    product.priceOverride !== null && product.priceOverride !== undefined
      ? product.priceOverride
      : '';
  const [priceOverride, setPriceOverride] = useState(initialOverride);
  const [isPinned, setIsPinned] = useState<boolean>(
    Boolean((product as { isPinned?: boolean }).isPinned)
  );
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function reset(): void {
    setPriceOverride(initialOverride);
    setIsPinned(Boolean((product as { isPinned?: boolean }).isPinned));
    setSubmitState({ kind: 'idle' });
    setShowDeleteConfirm(false);
  }

  function handleOpenChange(nextOpen: boolean): void {
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  }

  async function handleSave(): Promise<void> {
    const initialPinned = Boolean(
      (product as { isPinned?: boolean }).isPinned
    );
    const body = buildPatchBody({
      currentPriceOverrideField: priceOverride,
      currentIsPinnedField: isPinned,
      initialPriceOverride: initialOverride,
      initialIsPinned: initialPinned,
    });
    if (Object.keys(body).length === 0) {
      // No changes — just close. Treat as cancel.
      handleOpenChange(false);
      return;
    }
    setSubmitState({ kind: 'patching' });
    try {
      const res = await fetch(
        `/api/sale/broadcast-products/${encodeURIComponent(product.broadcastProductId)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubmitState({
          kind: 'error',
          message: json?.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      reset();
      handleOpenChange(false);
      onUpdated?.();
    } catch (err) {
      setSubmitState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async function handleDelete(): Promise<void> {
    setSubmitState({ kind: 'deleting' });
    try {
      const res = await fetch(
        `/api/sale/broadcast-products/${encodeURIComponent(product.broadcastProductId)}`,
        {
          method: 'DELETE',
          credentials: 'same-origin',
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubmitState({
          kind: 'error',
          message: json?.error ?? `HTTP ${res.status}`,
        });
        // Stay in dialog so admin can read the error (likely an
        // active-booking-guard 409 from the repository).
        setShowDeleteConfirm(false);
        return;
      }
      reset();
      handleOpenChange(false);
      onDeleted?.();
    } catch (err) {
      setSubmitState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      setShowDeleteConfirm(false);
    }
  }

  const submitting =
    submitState.kind === 'patching' || submitState.kind === 'deleting';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>แก้ไขรหัสสินค้า</DialogTitle>
          <DialogDescription>
            แก้ไขราคาพิเศษและการปักหมุดของรหัส{' '}
            <span className="font-mono font-semibold">{product.displayCode}</span>.
            displayCode / variant / รอบไลฟ์ แก้ไขไม่ได้เพื่อรักษา audit trail
            ของ booking ที่อ้างอิงอยู่.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only context */}
          <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">สินค้า</span>
              <span className="font-medium">{product.productName}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">SKU</span>
              <span className="font-mono">{product.sku}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">สต็อกพร้อม</span>
              <span className="font-mono">{product.availableQty} ชิ้น</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">ราคา variant</span>
              <span className="font-mono">RM{product.unitPrice}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-product-code-priceOverride">
              ราคาพิเศษ (เว้นว่างเพื่อใช้ราคา variant)
            </Label>
            <Input
              id="edit-product-code-priceOverride"
              placeholder={product.unitPrice}
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
              inputMode="decimal"
              disabled={submitting}
            />
            <p className="text-[10px] text-muted-foreground">
              ทศนิยมไม่เกิน 2 ตำแหน่ง. ราคาเดิมของ booking ที่สร้างไปแล้วไม่กระทบ.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-product-code-isPinned">ปักหมุดที่ด้านบน</Label>
            <Button
              id="edit-product-code-isPinned"
              type="button"
              variant={isPinned ? 'default' : 'outline'}
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => setIsPinned((v) => !v)}
              disabled={submitting}
            >
              {isPinned ? (
                <Pin className="size-3.5" aria-hidden />
              ) : (
                <PinOff className="size-3.5" aria-hidden />
              )}
              {isPinned ? 'ปักหมุดอยู่' : 'ไม่ปักหมุด'}
            </Button>
          </div>

          {submitState.kind === 'error' && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              <span>{submitState.message}</span>
            </div>
          )}

          {/* Delete confirmation panel — replaces footer when active */}
          {canDelete && showDeleteConfirm && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-start gap-2 text-amber-900 dark:text-amber-100">
                <AlertTriangle className="size-3.5 shrink-0 translate-y-0.5" aria-hidden />
                <div className="space-y-1">
                  <p className="font-medium">ยืนยันลบรหัสสินค้า?</p>
                  <p className="opacity-90">
                    ลบไม่ได้ถ้ามี booking ที่ยังไม่ EXPIRED อ้างอิงรหัสนี้ (ระบบจะคืนค่าผิดพลาด 409).
                    ลบสำเร็จแล้วกู้คืนไม่ได้.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={submitting}
                >
                  ยกเลิก
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 gap-1.5"
                  onClick={handleDelete}
                  disabled={submitting}
                >
                  {submitState.kind === 'deleting' ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden />
                  )}
                  ลบทันที
                </Button>
              </div>
            </div>
          )}
        </div>

        {!showDeleteConfirm && (
          <DialogFooter className="gap-2 sm:justify-between">
            {canDelete ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={submitting}
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" aria-hidden />
                ลบรหัส
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                ยกเลิก
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={submitting}
                className="gap-1.5"
              >
                {submitState.kind === 'patching' ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-3.5" aria-hidden />
                )}
                บันทึก
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
