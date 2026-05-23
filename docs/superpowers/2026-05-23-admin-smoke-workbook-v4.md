# Admin Smoke Workbook v4 — Inventory Bulk Edition

**Filed:** 2026-05-23 (Block 6 — post D2-A+D2-B)
**Author:** Claude Sonnet 4.6
**Master baseline:** `8222a2f`
**Status:** Workbook addition (Section L). Extends v3 without invalidating it. R2 docs-only.

Boss UI smoke is still owed for Sections A-K from workbook v3. This v4 adds **Section L** for the new inventory bulk feature (Tier 3.9-D2-A + D2-B). Boss runs L when comfortable and only after D2-B PR merges to master.

---

## Pre-requisites for Section L

- PR #101 D2-R merged ✅ (`759a48b`)
- PR #104 D2-A endpoint merged ✅ (`55b24a8`)
- PR #105 D2-B UI merged ⏸ awaits Boss verdict
- Vercel deploy of merged master complete + Ready

---

## L. `/inventory/new` bulk range UI

### L.1 — Toggle visibility (default OFF)

1. Sign in as OWNER or MANAGER on a test shop
2. Navigate `/inventory/new`
3. Default view = Quick form
4. **Expected:**
   - "+ สร้างสินค้าใหม่ (Quick Create)" button visible
   - Click button → dialog opens
   - "สร้างหลายรหัส (Bulk range)" checkbox visible at top of form, UNCHECKED
   - No Start No / End No / preview-count rendered
   - "สูงสุด 100 รายการ / รอบ" hint NOT shown

### L.2 — Toggle ON behavior

1. In open dialog, click the toggle checkbox
2. **Expected:**
   - Start No + End No inputs appear (via shared QuickProductFormFields)
   - Preview count area renders (empty until both numbers filled)
   - "สูงสุด 100 รายการ / รอบ" hint shows on right
   - Top-of-form fields (stockCodeBase, saleCodeBase) still required

### L.3 — Preview count rendering

1. Toggle ON. Fill `stockCodeBase=STK`, `saleCodeBase=CM`, `startNo=1`, `endNo=5`
2. **Expected:**
   - Preview shows 5 items example (CM1, CM2, ... CM5 etc.)
   - Count badge shows "5"
3. Change `endNo=200`
4. **Expected:**
   - Preview shows cap warning or field error (server validates 101+)

### L.4 — Single-mode submit preserves legacy behavior

1. Toggle OFF (default). Fill `stockCodeBase=STK-SINGLE-001`, `saleCodeBase=CM-S1`
2. Click "สร้างสินค้า"
3. **Expected:**
   - POST `/api/products` (NOT `/api/inventory/quick-product-bulk`)
   - Returns 201 + dialog closes
   - `/inventory` list refreshes; new product visible
   - Variant created with sku=`STK-SINGLE-001`, price='0', quantity=1
   - **NO BroadcastProduct row created** for that shop

### L.5 — Bulk-mode submit creates N products + 0 BroadcastProducts

1. Toggle ON. Fill `stockCodeBase=STK-BULK`, `saleCodeBase=CM-B`, `startNo=1`, `endNo=3`
2. Click "สร้างสินค้า"
3. **Expected:**
   - POST `/api/inventory/quick-product-bulk` returns 201
   - Body shape: `{ success: true, data: { createdCount: 3, items: [{productId, variantId, stockCode, saleCode, productCreated, variantCreated}] } }`
   - **NO `broadcastProductId` field** in response items
   - In-dialog success: "สร้างสินค้า 3 รายการสำเร็จ"
   - Dialog STAYS OPEN; form resets
   - `/inventory` list refreshes; 3 new products visible (STK-BULK1, STK-BULK2, STK-BULK3)
   - Each has variant with sku=`CM-B<n>`
   - Query `SELECT count(*) FROM "BroadcastProduct" WHERE "shopId" = '<test shop>' AND ...` returns **0 new rows** (no broadcast rows created)

### L.6 — Reuse-or-create (Tier 3.9-B-Fix-1)

1. With existing STK-BULK1..3 from L.5, toggle ON; fill same `stockCodeBase=STK-BULK`, `saleCodeBase=CM-B`, `startNo=1`, `endNo=3` again
2. Click "สร้างสินค้า"
3. **Expected:**
   - Returns 201 + `createdCount: 3`
   - Items have `productCreated: false` + `variantCreated: false` for all 3 (reused)
   - `/inventory` list count unchanged (no duplicates)
   - Product names/details/categories NOT overwritten

### L.7 — All-or-nothing rollback

1. Toggle ON. Force one collision in bulk: fill `stockCodeBase=STK-PARTIAL`, `saleCodeBase=CM-P`, `startNo=10`, `endNo=12`
2. Pre-create `STK-PARTIAL11` via single mode first (so middle of bulk range collides)
3. Submit bulk
4. **Expected:**
   - Either 409 Conflict or 201 (if reuse path engages — verify before declaring fail)
   - If 409: count of new products in shop UNCHANGED from pre-submit baseline (transaction rolled back; no partial creates)

### L.8 — Quantity 0 + price 0 valid

1. Toggle ON. Fill all + `quantity=0` + `price=0`
2. **Expected:**
   - Submit succeeds 201
   - Variants created with quantity=0, price=0 (sold-out placeholder semantic)

### L.9 — Cap enforcement (server-side)

1. Toggle ON. Fill `startNo=1`, `endNo=101`
2. **Expected:**
   - Server returns 400 Validation failed
   - Field error on `endNo`: "Bulk range too large: 101 > 100"
   - No products created

### L.10 — RBAC

1. Sign in as CHAT_SUPPORT user
2. Navigate `/inventory/new` (if accessible)
3. Attempt bulk submit
4. **Expected:**
   - 403 Insufficient permissions on POST `/api/inventory/quick-product-bulk`
   - Dialog error: "Insufficient permissions"
5. Repeat as WAREHOUSE user
6. **Expected:** 403 same

### L.11 — Advanced ProductForm path untouched

1. On `/inventory/new`, click "Advanced form" toggle
2. **Expected:**
   - Switches to multi-variant `ProductForm` (legacy)
   - Bulk toggle is NOT present in Advanced view
   - Existing Advanced create flow unchanged

### L.12 — Image upload absent in both modes

1. Open dialog in either single or bulk mode
2. **Expected:**
   - No "รูปสินค้า URL" field visible (image upload deferred per Boss exclusion)
   - To add images, admin uses inventory edit page POST `/api/products/[id]/images` (existing pattern)

---

## L exit criteria

| Sub-section | Status |
|---|---|
| L.1 | _Boss to verify_ |
| L.2 | _Boss to verify_ |
| L.3 | _Boss to verify_ |
| L.4 | _Boss to verify_ |
| L.5 | _Boss to verify_ |
| L.6 | _Boss to verify_ |
| L.7 | _Boss to verify_ |
| L.8 | _Boss to verify_ |
| L.9 | _Boss to verify_ |
| L.10 | _Boss to verify_ |
| L.11 | _Boss to verify_ |
| L.12 | _Boss to verify_ |

### Section L PASS

- D2-A + D2-B feature verified live
- Inventory bulk creates products only (no BroadcastProduct, no saleDate)
- Single-mode preserved
- Advanced ProductForm intact

### Section L FAIL

- Screenshot + Network response + error toast verbatim
- Server log query for failed POST `/api/inventory/quick-product-bulk` request
- Report `UI_SMOKE_v4_L_FAIL` with sub-section + evidence
- Claude classifies + opens hotfix PR
- DO NOT start Phase 1.5 / Facebook runtime / outbound while L is failing

---

## Verifier (Docker, non-prod only)

Section L can be partially validated WITHOUT touching production via the new verifier script (Tier 3.9-D2-C):

```bash
docker compose up -d postgres
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy
CONFIRM_NON_PROD_DB=true \
  VERIFY_T39_D2_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:inventory:bulk
```

Covers Cases A-J at the repository layer with 6-layer production safety guard. Exit 0 = green.

Cases:
- A — single create + zero BroadcastProduct
- B — bulk 1..5 + zero BroadcastProduct
- C — quantity 0
- D — price 0
- E — no category
- F — reuse-or-create Product (Tier 3.9-B-Fix-1)
- G — bad code shape rejected + rollback
- H — invalid range reject
- I — max batch reject (>100)
- J — cleanup

---

## Cross-references

- workbook v1 (PR #67)
- workbook v2 (PR #83)
- workbook v3 (PR #92) — Sections A-K still owed
- PR #101 D2-R shared core
- PR #104 D2-A endpoint
- PR #105 D2-B UI (awaits verdict)
- `scripts/verify-inventory-bulk-product-codes.ts` (D2-C)
- `tests/e2e/prod-unauth-smoke.spec.ts` (17 unauth cases — unchanged)
