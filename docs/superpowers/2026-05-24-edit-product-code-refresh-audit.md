# EditProductCodeDialog Refresh Audit — F4 Closed

**Filed:** 2026-05-24 (Phase B follow-up to Track 6 + Track 8)
**Author:** Claude Sonnet 4.6
**Master baseline:** `8cb8f7f` (post Phase A queue merge)
**Status:** Audit complete. **No bug found.** Risk #5 (Track 6) + F4 (Track 8) RESOLVED.

Track 6 §6 + Track 8 F4 flagged potential bug: "EditProductCodeDialog
may not bump `refetchToken` after save — stale display." This audit
verifies the actual code path. Result: NOT a bug.

---

## 1. Verified call chain

```
EditProductCodeDialog
  ├── handleSave() → fetch PATCH → onUpdated?.()
  └── handleDelete() → fetch DELETE → onDeleted?.()
        │
        ▼
SaleProductGridPlaceholder.tsx (lines 283-290)
  EditProductCodeDialog
    onUpdated={() => { setEditTarget(null); onProductCreated?.(); }}
    onDeleted={() => { setEditTarget(null); onProductCreated?.(); }}
        │
        ▼
SaleWorkspaceShell.tsx (line 394)
  <SaleProductGridPlaceholder
    ...
    onProductCreated={() => setRefetchToken((n) => n + 1)}
  />
        │
        ▼
refetchToken bump triggers:
  - BP list refetch (SaleWorkspaceShell effect, deps include refetchToken)
  - Bookings refetch (same effect)
  - SaleSummaryPanel refetch (consumes refetchToken prop)
```

**Conclusion:** save AND delete both reach `setRefetchToken((n) => n + 1)`. All downstream consumers refetch. NOT a bug.

---

## 2. Why the audit suspected a bug

Track 6 §6 said: "Audit gap: confirm EditProductCodeDialog bumps refetchToken on save. If not, edited price/name will stay stale until next manual refresh."

Origin of suspicion: prop name `onProductCreated` is misleading — sounds like "create-only" callback, masks that edit + delete also fire it. Code grep on `refetchToken` alone wouldn't surface the indirection.

**No code change needed.** Prop name is a documentation defect, not a behavior defect.

---

## 3. Optional follow-up (R2, low priority)

Rename callback for clarity. Currently:

```ts
// SaleProductGridPlaceholder.tsx prop signature
readonly onProductCreated?: () => void;
```

Fires on: quick-create + AddFromStock + edit + delete. Misleading name.

**Proposed rename:** `onProductsChanged` or `onBroadcastProductsMutated`.

**Effort:** 1 file edit + grep+replace in SaleWorkspaceShell. R2. No test changes. ~5 min.

Held until Boss verdict — not urgent because behavior is correct.

---

## 4. Verification

Read paths:
- `src/components/sale/EditProductCodeDialog.tsx` lines 121-123 (handleSave success calls onUpdated)
- `src/components/sale/EditProductCodeDialog.tsx` lines 153-155 (handleDelete success calls onDeleted)
- `src/components/sale/SaleProductGridPlaceholder.tsx` lines 283-290 (both wired to onProductCreated)
- `src/components/sale/SaleWorkspaceShell.tsx` line 394 (onProductCreated bumps refetchToken)
- `src/components/sale/SaleWorkspaceShell.tsx` (effect deps include refetchToken — refetches BP + bookings)
- `src/components/sale/SaleSummaryPanel.tsx` lines 74-83 (effect deps include refetchToken — refetches summary)

No automated test exists explicitly for "edit → refetchToken bump" round trip. Could add R2 unit test if desired:

```ts
it('calls onUpdated which propagates to refetchToken bump', () => {
  // Mock fetch + mount dialog + click Save + assert onUpdated called
});
```

Not added in this PR — behavior verified by code reading, not regressed.

---

## 5. Updates to prior audits

| Doc | Status |
|---|---|
| `2026-05-24-sale-data-fetch-audit.md` §6 risk #5 EditProductCode stale | **RESOLVED — not a bug** |
| `2026-05-24-sale-data-fetch-audit.md` §10 priority risk table | downgrade severity Medium → None for row 5 |
| `2026-05-24-admin-workflow-polish-audit.md` F4 | **RESOLVED — not a bug** |
| `2026-05-24-admin-workflow-polish-audit.md` §3 summary table F4 | mark RESOLVED |
| `2026-05-24-admin-workflow-polish-audit.md` §4 recommended PR sequence #1 (audit F4) | superseded by this PR |

This PR is the audit. Boss may close F4 in tracking.

---

## 6. Hard rules respected

- ❌ No source code change (audit only)
- ❌ No production mutation
- ❌ No env / flag change
- ❌ No schema change
- ❌ No new test (deferred, optional)
- ✅ Behavior verified by reading file:line
- ✅ pak-ta-kra untouched

---

## 7. Status

- F4 audit complete
- No bug found
- No follow-up PR opened
- Optional rename held for Boss verdict
- Track 6 risk #5 + Track 8 F4 both downgraded to "resolved — not a bug"

R2 docs-only.
