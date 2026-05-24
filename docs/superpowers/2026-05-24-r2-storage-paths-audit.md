# R2 Storage Paths — Read-Only Audit

**Filed:** 2026-05-24 (autonomous docs block Track E)
**Author:** Claude Sonnet 4.6
**Status:** Read-only audit. NO code change. NO env mutation. NO R2 mutation. NO real bucket inspection. Audit reads source + config only.

Maps current R2 usage in liveshop-pro before any future storage runtime PR opens. Future PRs touching R2 must respect the boundaries documented here.

Source cite anchors:
- `src/lib/upload/storage.ts` (R2 client + saveFile + deleteFile)
- `src/app/api/upload/route.ts` (generic admin upload)
- `src/app/api/products/[id]/images/route.ts` (product images POST)
- `src/app/api/products/[id]/images/[filename]/route.ts` (product image DELETE)
- `src/app/api/storefront/[shopId]/orders/[orderId]/slip/route.ts` (payment slip upload)
- `next.config.ts` (CSP `img-src` allowlist + Next image remotePatterns)
- `docs/superpowers/2026-05-24-admin-api-index.md` (admin route index)

---

## 0. Scope

Audit current R2 (Cloudflare object storage) surface:

- which routes write to R2
- which routes delete from R2
- key path convention (top-level prefixes)
- public/private boundary (CSP `img-src` allowlist)
- env var inventory + sensitivity
- existing guardrails (file size, mime type, hash-based filenames)
- gaps / risks for future runtime

NO code change in this PR. NO env change. NO R2 mutation. NO bucket inspection (no `aws s3 ls` / `r2 list` calls).

---

## 1. R2 client setup

`src/lib/upload/storage.ts` exports two fns: `saveFile` + `deleteFile`. Client is a singleton `S3Client` (AWS SDK v3) pointed at Cloudflare R2 via:

```ts
endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
region:   'auto'
```

| Env var | Default | Sensitivity | Required for upload? |
|---|---|---|---|
| `R2_ACCOUNT_ID` | `''` | LOW (visible in endpoint URL) | YES — endpoint construction |
| `R2_ACCESS_KEY_ID` | `''` | **HIGH** — write credential | YES |
| `R2_SECRET_ACCESS_KEY` | `''` | **HIGH** — write credential | YES |
| `R2_BUCKET_NAME` | `'liveshop-images'` | LOW | YES (defaulted) |
| `R2_PUBLIC_URL` | `''` | LOW (public CDN base) | YES for usable URL (e.g. `https://images.nazhahatyai.com`) |

Default-empty pattern means missing env causes silent fail at upload time (R2 SDK throws). No startup-time env validation for these 5 vars (gap — see §6).

**Bucket name:** `liveshop-images` (from default; verify Vercel env in production matches).
**Public CDN:** `images.nazhahatyai.com` (per `CLAUDE.md` Identity table + CSP allowlist).

---

## 2. Upload paths (top-level prefixes used today)

`saveFile(input, subfolder)` builds key as `${subfolder}/${hash}${ext}` where `hash = crypto.randomBytes(16).toString('hex')` (32 hex chars). Caller controls the subfolder prefix.

| Subfolder prefix | Caller | What | Key shape |
|---|---|---|---|
| `products/<productId>` | `src/app/api/products/[id]/images/route.ts:81` | product image (sharp-optimized to WebP, max width MAX_WIDTH, quality 80) | `products/<cuid>/<32hex>.webp` |
| `<shopId>/slips` | `src/app/api/storefront/[shopId]/orders/[orderId]/slip/route.ts:49` | customer payment slip upload (storefront) | `<cuid>/slips/<32hex>.<orig-ext>` |
| `<shopId>/<subfolder>` | `src/app/api/upload/route.ts:29` | generic admin upload — subfolder is admin-controlled query param | `<cuid>/<admin-subfolder>/<32hex>.<orig-ext>` |

**Observation:** 3 different prefix conventions:

1. `products/<productId>/` — product-scoped, NO shop prefix in path (relies on bucket isolation per Vercel env)
2. `<shopId>/slips/` — shop-prefixed, single fixed inner folder
3. `<shopId>/<admin-subfolder>/` — shop-prefixed, admin-provided inner folder

No single canonical pattern. Future runtime should converge on `<shopId>/<resource>/<scoped-id>/<hash>.<ext>` to make per-shop policy (lifecycle / retention / GDPR delete) trivially scriptable.

---

## 3. Delete paths

| Caller | What |
|---|---|
| `src/app/api/products/[id]/images/[filename]/route.ts:46` | DELETE single product image; calls `deleteFile(imageUrl)` then removes URL from `product.images[]` |

**`deleteFile` extracts the R2 key from the public URL** by stripping the `R2_PUBLIC_URL` prefix (`storage.ts:95-97`). If a URL doesn't start with `R2_PUBLIC_URL` (e.g. external image, or env mismatch between envs), it falls back to treating the entire URL as the key — likely 404s in R2 but doesn't throw because `deleteFile` swallows errors.

**No other delete callers.** Slips are never deleted. Generic uploads are never deleted. Orphans accumulate unless manual R2 lifecycle policy cleans them (no such policy documented — gap §6).

---

## 4. Guardrails currently in place

### 4.1 saveFile (`storage.ts`)

| Guard | Value | Source |
|---|---|---|
| Allowed mime types | jpeg / png / webp / gif | `storage.ts:23-28` |
| Max file size | 5 MB | `storage.ts:30` |
| Filename | `crypto.randomBytes(16).toString('hex')` + ext | `storage.ts:63-64` (no user-controlled filename → defeats path traversal) |
| Extension | derived from mime via `getExtension` switch (defaults `.bin`) | `storage.ts:113-121` |

### 4.2 Product image route

| Guard | Value | Source |
|---|---|---|
| Mime type re-check | jpeg / png / webp | `src/app/api/products/[id]/images/route.ts` |
| File size re-check | 4 MB (tighter than storage layer) | same |
| Sharp re-encode | WebP @ quality 80, max width clamp | same — defeats EXIF / malformed image attacks |
| Auth | `requireAuth + shop ownership check` | per route |
| RBAC | OWNER / MANAGER (write) | per route |

### 4.3 Slip upload route

| Guard | Value | Source |
|---|---|---|
| File present check | required | `slip/route.ts:44` |
| Mime type re-check | inherited from `saveFile` (5 mime types) | indirect |
| Storefront auth | customer session per shop | per route |
| NOT sharp-optimized | raw upload | gap — slip is admin-eye-only, but unoptimized blobs blow size budget |

### 4.4 Generic admin upload route

| Guard | Value | Source |
|---|---|---|
| Subfolder | admin-provided (`user.shopId/<subfolder>`) | `upload/route.ts:29` |
| Auth | `requireAuth` | per route |
| Mime type | inherited from `saveFile` | indirect |
| NOT sharp-optimized | raw upload | gap — admin can upload large unoptimized PNGs |

### 4.5 CSP allowlist (`next.config.ts:37`)

`img-src` permits ONLY:

- `'self'` (same origin)
- `data:` + `blob:` (inline + browser objects)
- `https://images.nazhahatyai.com` (R2 public CDN)
- `https://graph.facebook.com` (FB profile pics)
- `https://*.fbcdn.net` (FB image CDN)

Hot-linked images from anywhere else are blocked at browser. Future R2 path additions must ensure the public URL still hits `images.nazhahatyai.com` (NOT raw `*.r2.cloudflarestorage.com`).

### 4.6 Next image remotePatterns

Per `next.config.ts:30-34`:

- `graph.facebook.com`
- `*.fbcdn.net`

**Note:** `images.nazhahatyai.com` is NOT in `images.remotePatterns` — meaning Next `<Image>` component cannot optimize R2-hosted images. They render via plain `<img>` tags or pass-through `<Image unoptimized>`. Acceptable for current workflow (sharp pre-optimized on upload) but worth verifying future runtime PRs don't accidentally route product images through Next's optimizer (would 4xx).

---

## 5. Public/private boundary

**Today everything in R2 is public-readable** via `images.nazhahatyai.com` CDN. Boss admin uploads go to public bucket; storefront customer slip uploads go to public bucket. URLs use unguessable `crypto.randomBytes(16)` hex (128 bits entropy) which serves as the only access control.

| Resource | Today's exposure | Risk if URL leaks |
|---|---|---|
| Product image | public (intentional — storefront renders) | none (already public catalog) |
| Customer payment slip | public-via-unguessable-URL | **HIGH** — payment slip = customer bank account screenshot leak |
| Generic admin upload | public-via-unguessable-URL | depends on admin use — could leak internal docs |

**Gap (HIGH priority before any new sensitive use case):** future PRs uploading PII / order docs / customer ID must use signed-URL pattern (presigned GET expiring in N minutes) instead of public CDN. R2 supports it; today's code does not.

For slips specifically: Boss admin views slip in admin Order detail. A signed-URL adapter that mints short-lived URLs server-side would close the leak window without changing UX.

---

## 6. Identified gaps (HELD — Boss verdict required before any fix PR)

| # | Gap | Severity | Suggested fix risk |
|---|---|---|---|
| G1 | No startup env validation for `R2_*` vars (silent fail at first upload) | MEDIUM | R2 — add Zod schema entries in `src/lib/env.ts` |
| G2 | No R2 lifecycle policy documented (orphans accumulate) | MEDIUM | R2 documentation + R0 Boss configures in Cloudflare Dashboard |
| G3 | Slip upload uses public CDN URL (HIGH if leaked) | **HIGH** | R1 — refactor to presigned-URL adapter for slip reads |
| G4 | Generic `/api/upload` admin subfolder param is admin-controlled (path injection? `..` allowed?) | MEDIUM | R2 — add subfolder allowlist + reject `..` / leading `/` |
| G5 | `deleteFile` swallows errors silently (orphan-by-typo) | LOW | R2 — log non-404 errors |
| G6 | No file content sniffing (mime header trust — attacker uploads `.jpg` with PHP payload — mitigated by sharp re-encode on product but NOT on slip/generic) | MEDIUM | R2 — add `file-type` sniff on slip + generic |
| G7 | No per-shop bucket isolation (single bucket, prefix-only) | LOW (acceptable for SaaS pattern) | R0 if Boss wants per-shop bucket (migration) |
| G8 | Three different path prefix conventions across 3 callers | LOW | R2 — converge on `<shopId>/<resource>/<scoped-id>/<hash>.<ext>` |
| G9 | No upload audit log (who uploaded what when) | MEDIUM | R2 — add `UploadAudit` table + log on success |
| G10 | No bucket-side virus/malware scan (Cloudflare R2 doesn't include this; would need separate workflow) | LOW (mime + sharp re-encode catches common image abuse; would matter if file types expand to PDF/zip) | R1 — add Cloudflare Workers AI scan trigger |
| G11 | `images.nazhahatyai.com` NOT in `next.config.ts` `images.remotePatterns` (Next `<Image>` cannot serve R2 images optimized) | LOW (intentional today) | R2 — add pattern only if Next `<Image>` use case lands |

**None of these gaps are fixed in this PR.** This audit lists them for Boss verdict + future PR sequencing.

---

## 7. Hard no-go (apply to any future R2 runtime PR)

- ❌ NEVER write to R2 outside `saveFile` (no direct `S3Client` calls in route code)
- ❌ NEVER expose `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` to client (server-only)
- ❌ NEVER accept admin-controlled key path that bypasses subfolder allowlist (no `..` / no leading `/`)
- ❌ NEVER store PII / payment data in URLs (use signed-URL adapter)
- ❌ NEVER skip mime type check
- ❌ NEVER skip file size cap
- ❌ NEVER use predictable filename (no timestamps, no usernames — only crypto random)
- ❌ NEVER add R2 host to `images.remotePatterns` without verifying Next `<Image>` optimization is desired
- ❌ NEVER mass-delete via `aws s3 rm --recursive` or equivalent (R0 — Boss explicit only)
- ❌ NEVER rotate R2 keys without coordinating with Vercel env update + redeploy
- ❌ NEVER add a new public-CDN exposure without §6 G3 reviewed first

---

## 8. Future PR sequence (if Boss wants to close gaps)

Recommended order (R2 unless flagged):

| Order | PR | Risk | Closes gap |
|---|---|---|---|
| 1 | `feat(env): validate R2_* vars at startup` | R2 | G1 |
| 2 | `fix(upload): reject path traversal in /api/upload subfolder` | R2 | G4 |
| 3 | `fix(upload): log non-404 deleteFile errors` | R2 | G5 |
| 4 | `refactor(storage): converge upload key prefix to canonical pattern` | R2 (non-breaking — old keys keep working) | G8 |
| 5 | `feat(audit): log uploads to UploadAudit table` | R1 (new table) | G9 |
| 6 | `fix(upload): file-type sniff on slip + generic` | R2 | G6 |
| 7 | `feat(storage): signed-URL adapter for slip reads` | **R1 — DISSENT 4-bullet required** (changes slip viewing pattern across storefront + admin) | G3 |
| 8 | `docs(ops): R2 lifecycle policy` (Cloudflare Dashboard action by Boss) | R2 docs + Boss-action | G2 |

Each PR ≤ 200 LOC ideally. None of these are authorized in this PR — Boss verdict needed.

---

## 9. Cross-references

- `src/lib/upload/storage.ts` (R2 client + saveFile + deleteFile, 121 lines)
- `src/app/api/upload/route.ts` (generic admin upload)
- `src/app/api/products/[id]/images/route.ts` (product images POST)
- `src/app/api/products/[id]/images/[filename]/route.ts` (product image DELETE)
- `src/app/api/storefront/[shopId]/orders/[orderId]/slip/route.ts` (slip upload)
- `src/lib/env.ts:18` (existing env schema — no R2_* entries today, gap G1)
- `next.config.ts:32-43` (CSP + headers)
- `next.config.ts:30-34` (Next image remotePatterns)
- `CLAUDE.md` Identity table (`images.nazhahatyai.com` CDN)
- `CLAUDE.md` Skill routing (`src/lib/upload/storage.ts` → `security-and-hardening`, `verification-before-completion`)
- `CLAUDE.md` Project-specific high-risk paths (`src/app/api/products/[id]/images/**` → `dissent-4-bullet`, `security-and-hardening`, `verification-before-completion`)

---

## 10. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero R2 mutation
- Zero bucket inspection (no `aws s3 ls` / `r2 list`)
- Zero secret read / write
- Zero new test
- 11 gaps identified for Boss verdict
- 8-PR fix sequence proposed (none authorized in this PR)
- pak-ta-kra untouched
