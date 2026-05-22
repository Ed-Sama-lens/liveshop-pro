/**
 * Shared form state + types for the Quick Product form fields.
 *
 * Tier 3.9-D (2026-05-23) — Extracted from
 * `src/components/sale/CreateQuickProductCodeDialog.tsx` so both the
 * `/sale` quick-create dialog and the `/inventory/new` quick form can
 * reuse the same field layout, defaults, validation surface, and Thai
 * labels.
 *
 * The form STATE is shared; the SUBMIT handler is owned by each parent
 * (sale POSTs to `/api/sale/quick-product-codes`, inventory POSTs to
 * `/api/products`). saleDate is NOT in this shared shape — it is
 * sale-specific and the sale dialog adds it at submit time.
 */

export interface QuickProductCategory {
  readonly id: string;
  readonly name: string;
}

/**
 * Form state mirrors `CreateQuickProductCodeDialog.FormState` so the
 * sale dialog can adopt this type without behavior change.
 *
 * Inventory variant uses the same shape but ignores `startNo` / `endNo`
 * (bulk range deferred to PR 3.9-D2). The `imageUrl` field is also
 * deferred for inventory (real upload requires `/api/products/[id]/images`
 * which only exists after the product row is created).
 */
export interface QuickProductFormState {
  readonly stockCodeBase: string;
  readonly saleCodeBase: string;
  readonly categoryId: string;
  readonly productName: string;
  readonly productDetails: string;
  readonly imageUrl: string;
  readonly startNo: string;
  readonly endNo: string;
  readonly quantity: string;
  readonly lowStockAt: string;
  readonly price: string;
  readonly cost: string;
}

export const EMPTY_QUICK_PRODUCT_FORM: QuickProductFormState = Object.freeze({
  stockCodeBase: '',
  saleCodeBase: '',
  categoryId: '',
  productName: '',
  productDetails: '',
  imageUrl: '',
  startNo: '',
  endNo: '',
  quantity: '1',
  lowStockAt: '',
  price: '',
  cost: '',
});

/** Max products per single bulk request when the bulk range is enabled. */
export const QUICK_PRODUCT_BULK_MAX_RANGE = 100;
