# R2 G8 — Path Prefix Convergence Plan

**Filed:** 2026-05-25 (post Goal deep audit; R2 G6 #157 + G5 #158 in flight)
**Status:** Plan only. NO runtime change. NO storage migration. Implementation gated on Boss verdict per audit recommendation.

Closes the planning gap for R2 G8 from `2026-05-24-r2-storage-paths-audit.md`. G8 is the LOW-priority but maintainability-positive R2 followup: today the 3 upload callers each use a DIFFERENT prefix convention, which makes per-shop lifecycle / retention / GDPR delete policies awkward to script.

---

## 1. Current prefix inventory (post #137 + #138 + #146 + #147 + #157 + #158)

Verified from source 2026-05-25 (master `94adfe8`):

| Caller | Subfolder arg | Resulting key shape |
|---|---|---|
| `src/app/api/products/[id]/images/route.ts:81` | `products/<productId>` | `products/<cuid>/<32hex>.webp` |
| `src/app/api/storefront/[shopId]/orders/[orderId]/slip/route.ts:49` | `<shopId>/slips` | `<cuid>/slips/<32hex>.<orig-ext>` |
| `src/app/api/upload/route.ts:65` | `<shopId>/<category>` | `<cuid>/<allowlist>/<32hex>.<orig-ext>` |

**3 distinct conventions:**
- Pattern 1 (legacy `products/`) — product-scoped, NO shop prefix in key path
- Pattern 2 (`<shopId>/slips/`) — shop-prefixed, fixed inner folder
- Pattern 3 (`<shopId>/<allowlist>/`) — shop-prefixed, category-allowlisted inner

---

## 2. Why convergence matters

| Operational concern | Current state | After convergence |
|---|---|---|
| Per-shop lifecycle policy (e.g. "delete shop X data on GDPR request") | Mixed paths — script must crawl 3 different prefix shapes | Single `<shopId>/*` prefix — `DELETE` by prefix |
| Retention policy (e.g. "delete slips >2y, keep product images forever") | Pattern 1 has no shop prefix; cross-shop scan needed | `<shopId>/<resource>/*` per resource policy |
| Storage cost attribution by shop | Hard — must classify by key pattern | Trivial — sum bytes under `<shopId>/*` |
| Audit log replay | Mixed | Uniform |
| Bucket policy R0 future refactor (private slip prefix) | Mixed — slip path varies by caller | Single `<shopId>/slips/*` predicate |

**Verdict:** convergence pays off when bucket policy R0 happens (planned ≥1 week post WIRE-3 prod stable). Until then, keeping legacy paths working is cheap.

---

## 3. Canonical pattern (recommendation)

```
<shopId>/<resource>/[<scoped-id>/]<32hex>.<ext>
```

Where:
- `<shopId>` = always present (per-shop scoping for lifecycle / GDPR)
- `<resource>` = one of `products` / `slips` / `branding` / `general` (matches existing allowlist + opens to future categories per Boss verdict)
- `<scoped-id>` = optional inner ID for grouping (product ID, order ID, etc)
- `<32hex>.<ext>` = unguessable filename + extension (existing pattern)

### Mapping current → canonical

| Current | Canonical | Migration risk |
|---|---|---|
| `products/<productId>/<hash>.webp` | `<shopId>/products/<productId>/<hash>.webp` | R1 — schema migration NOT needed (URLs in DB stay); but new uploads use new path |
| `<shopId>/slips/<hash>.<ext>` | `<shopId>/slips/<orderId>/<hash>.<ext>` (add orderId for grouping) | R2 — additive |
| `<shopId>/<category>/<hash>.<ext>` | `<shopId>/<category>/<hash>.<ext>` | none — already canonical |

---

## 4. Migration strategy (when Boss authorizes)

### Phase G8-1: write canonical pattern for NEW uploads (R2)

- Update `src/app/api/products/[id]/images/route.ts:81` to use `<shopId>/products/<productId>` instead of `products/<productId>`
- Update `src/app/api/storefront/[shopId]/orders/[orderId]/slip/route.ts:49` to use `<shopId>/slips/<orderId>` instead of `<shopId>/slips`
- `src/app/api/upload/route.ts` already canonical (no change)
- New uploads land in new path. Old uploads stay at old path (URLs in DB unchanged).
- Risk: **R2** — additive; old + new paths coexist; `deleteFile` already handles both.

### Phase G8-2: backfill rename (R0 — Boss explicit only)

After Phase G8-1 stable + bucket policy R0 ready:

- Cloudflare R2 `CopyObject` + `DeleteObject` per legacy-pattern blob
- Script: scan bucket for `products/*` (no shop prefix) → identify owner via DB lookup of `Product` row → copy to `<shopId>/products/<productId>/<hash>.<ext>` → update DB `Product.images[]` JSON array → delete old key
- Risk: **R0** — mass mutation; requires Boss explicit + ≥1 week stability + backup verification

### Phase G8-3: lockdown legacy paths (R1)

After backfill completes:

- Remove `products/` prefix handling from `extractKeyFromPublicUrl`
- Reject deletes against non-canonical paths
- Update audit / lifecycle scripts to assume canonical

---

## 5. Boss decisions needed

| # | Question | Recommended default |
|---|---|---|
| Q1 | Open G8-1 (new-uploads canonical) now? | **Defer** — wait until bucket policy R0 plan is closer (≥1 week post WIRE-3 stable) |
| Q2 | Add `<orderId>` grouping to slip path? | **Recommend YES** — pays off for GDPR / "delete this order's data" |
| Q3 | Migrate `products/` legacy backfill? | **Defer R0** — only if storage cost or GDPR forces it |
| Q4 | Add `<resource>` to canonical pattern? | **YES** (4 known: products/slips/branding/general) — matches existing route allowlist |
| Q5 | Allow per-shop bucket isolation later (G7)? | **Defer R0** — separate from G8; G8 keeps single bucket + prefix isolation |

---

## 6. Hard no-go (applies indefinitely)

- ❌ NEVER backfill rename without Boss explicit + verified backup
- ❌ NEVER `DELETE` legacy path before backfill verified row-count + sanity-check
- ❌ NEVER change `R2_BUCKET_NAME` env (R0 — bucket move)
- ❌ NEVER drop `extractKeyFromPublicUrl` legacy-path support until Phase G8-3 explicit
- ❌ NEVER expose canonical pattern via API contract change (URLs stay opaque to clients)
- ❌ NO env / schema migration for G8 phases 1-2 (Phase 3 R1 only)

---

## 7. Risk assessment per phase

| Phase | Risk | Reversibility | Time |
|---|---|---|---|
| G8-1 new uploads canonical | R2 | trivial revert | 30 min impl + 30 min tests |
| G8-2 backfill rename | **R0** | reverse migration possible but complex | 4-8 h script + Boss-run + verify |
| G8-3 lockdown legacy | R1 | revert by re-enabling extractor path | 1 h impl + tests |

---

## 8. Cross-references

- `docs/superpowers/2026-05-24-r2-storage-paths-audit.md` (G8 source)
- `docs/superpowers/2026-05-25-goal-deep-audit-handoff.md` (G8 recommendation #4)
- PR #137 — signed URL adapter (introduced `<shopId>/slips/`)
- PR #138 — upload allowlist (introduced `<shopId>/<category>/`)
- PR #146 — slip URL UI swap (no path change)
- PR #157 — file-type sniff (no path change)
- PR #158 — deleteFile error logging (no path change)
- `src/lib/upload/storage.ts` (saveFile + extractKeyFromPublicUrl + assertSafeKey)
- `src/lib/upload/path-guard.ts` (UPLOAD_VALID_CATEGORIES allowlist)

---

## 9. Status

| Item | Status |
|---|---|
| G8 plan | ✅ this doc |
| Boss verdict on Q1–Q5 | ⏸ pending |
| G8-1 implementation | ❌ not started — Boss-gated |
| G8-2 backfill | ❌ R0 — Boss explicit only |
| G8-3 lockdown | ❌ depends on G8-1 + G8-2 |
| pak-ta-kra | ✅ untouched |

R2 — docs only. No production change. No env / schema / migration.
