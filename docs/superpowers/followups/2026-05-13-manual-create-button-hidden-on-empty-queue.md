# Followup — Manual Create button hidden when booking queue empty

**Status:** BUG FOUND. No fix yet. Surfaced by Phase A Playwright production smoke.
**Date:** 2026-05-13
**Reporter:** Claude Opus 4.7 (during Phase A smoke run on `3dd72c7`)
**Severity:** MEDIUM — admin cannot create the first booking via UI on a fresh session.

---

## Symptom

Admin opens `/sale`, selects a live session that has zero existing bookings (typical fresh SCHEDULED or newly-started LIVE session). The Booking Queue panel shows the empty-state message "ยังไม่มีลูกค้าจอง" and the "+ สร้าง booking เอง (Manual Create — PENDING_REVIEW)" button is **NOT rendered**.

Workaround: admin must wait until the inbox parser (not yet shipped) or another channel creates at least 1 booking before Manual Create becomes available. For a brand-new live session this is a chicken-and-egg deadlock.

---

## Root cause

[src/components/sale/SaleBookingQueuePlaceholder.tsx](../../../src/components/sale/SaleBookingQueuePlaceholder.tsx) line 251:

```tsx
if (state.bookings.length === 0) {
  return (
    <SalePanelCard
      title="Customer Bookings / รายการจอง"
      subtitle="ยังไม่มีรายการจองในรอบไลฟ์นี้"
      icon={Users}
      variant="live"
    >
      <p className="text-sm text-muted-foreground">
        ยังไม่มีลูกค้าจองในรอบนี้ — เริ่มจองจาก inbox/comment เมื่อพร้อม
      </p>
    </SalePanelCard>
  );
}
```

This early-return runs **before** the strip block that contains the Manual Create trigger (~line 430+). On empty queue, render exits before the strip is ever mounted → button absent from DOM.

The Create Order strip + Manual Create button live in the same dashed container at the bottom of the panel. Both are gated by the same early return.

---

## Why it wasn't caught earlier

- Unit tests on `booking-queue.helpers.ts` test pure eligibility logic, not rendering.
- Manual smoke checklist Phase 4 ([2026-05-11-sale-read-only-manual-smoke.md](../2026-05-11-sale-read-only-manual-smoke.md)) Manual Create section starts with "From `/sale` with a live session selected + Booking Queue visible, locate '+ สร้าง booking เอง' button..." — assumes button visible, doesn't test the empty-queue path.
- No E2E coverage on the dialog trigger surface until Phase A spec landed.

---

## Suggested fix (NOT yet implemented)

Move the empty-state message **inside** the main render block, alongside the strip, so the Create Order + Manual Create controls always render when the panel is in `ready` state:

```tsx
// Conceptual diff — not committed.
export function SaleBookingQueuePlaceholder({ ... }) {
  // ... existing loading/error/no-session branches stay ...

  // Was: early return on state.bookings.length === 0
  // Becomes: render an empty hint inside the main body, keep strip.

  return (
    <SalePanelCard ...>
      {state.bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          ยังไม่มีลูกค้าจองในรอบนี้ — เริ่มจองจาก inbox/comment เมื่อพร้อม
          หรือกดสร้าง booking เองด้านล่าง
        </p>
      ) : (
        // existing bookings list
      )}

      {/* Strip + Create Order + Manual Create button always rendered when ready */}
      <div className="flex flex-col gap-2 ...">
        ...
      </div>
    </SalePanelCard>
  );
}
```

Behaviour preserved:
- Create Order button stays disabled when `selectedIds.size === 0` (existing logic).
- Manual Create button works regardless of booking count.
- Empty-state hint still shown to admin.

---

## Risk class

- R1 — UI-only patch in `SaleBookingQueuePlaceholder.tsx`. No schema. No new route. No mutation surface change. Mutation grep should remain 4 POSTs.
- Test impact: `tests/unit/components/sale/booking-queue.helpers.test.ts` unchanged (helpers untouched). New E2E coverage recommended once Phase B Playwright lands.

---

## Boss decision needed

1. Patch + commit as standalone follow-up fix? (`fix(sale): show Manual Create button on empty queue`)
2. Or bundle into Manual Create iteration 2 (e.g. CONFIRMED-on-create option) later?
3. After fix, re-run Phase A spec with fresh storageState — Steps 2-9 should pass even on a session with zero bookings.

---

## Refs

- Phase A spec: [tests/e2e/manual-create-phase-a.prod-smoke.spec.ts](../../../tests/e2e/manual-create-phase-a.prod-smoke.spec.ts) (uncommitted)
- Production commit at time of discovery: `3dd72c7`
- Vercel deploy: `GuNYb34pX` (Current Production)
- Reproduction screenshots: `tests/e2e/screenshots/manual-create-prod-smoke/01-sale-page-loaded.png` + `test-results/.../test-failed-1.png`
