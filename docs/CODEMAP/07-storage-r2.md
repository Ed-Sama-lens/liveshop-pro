# 07 — Storage (Cloudflare R2) & CSP

Image upload via Cloudflare R2 (S3-compatible). Public access via custom domain `images.nazhahatyai.com`.

Why R2 over Vercel Blob: 10GB free vs 500MB, zero egress, S3-compat.

## Setup

| | Value |
|---|---|
| Bucket | `liveshop-images` |
| Account ID | `7b2830d2bd6304f82611103525184318` |
| Endpoint | `https://7b2830d2bd6304f82611103525184318.r2.cloudflarestorage.com` |
| Custom domain | `images.nazhahatyai.com` (Active in Cloudflare) |
| API Token | "Account API Token" → Object Read & Write → bucket `liveshop-images` |

## Env vars (Vercel)

| Var | Value |
|---|---|
| `R2_ACCOUNT_ID` | `7b2830d2bd6304f82611103525184318` |
| `R2_ACCESS_KEY_ID` | (one-time displayed when creating token) |
| `R2_SECRET_ACCESS_KEY` | (one-time displayed when creating token) |
| `R2_BUCKET_NAME` | `liveshop-images` |
| `R2_PUBLIC_URL` | `https://images.nazhahatyai.com` |

**Critical**: Access key + secret are shown ONCE on token creation. If lost, must delete + recreate token.

## Client — `src/lib/upload/storage.ts`

Uses `@aws-sdk/client-s3` with R2 endpoint:

```ts
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});
```

### `saveFile(input, subfolder)` — accepts both:
- `File` object
- `{ buffer: Buffer, mimeType: string }` — preferred (avoids File constructor issues on Vercel serverless)

Returns frozen `{ url, filename, size, mimeType }`.

### `deleteFile(key)` — DeleteObjectCommand

## Upload route — `/api/products/[id]/images`

```ts
1. requireAuth() + role check (OWNER, MANAGER)
2. Find product (404 if not in user's shop)
3. Parse formData — accept BOTH 'files' and 'images' field names
4. Validate each file: MIME type ∈ {jpeg, png, webp}, size ≤ 4MB, max 5 files
5. For each file:
   const buffer = Buffer.from(await file.arrayBuffer());
   const optimized = await sharp(buffer)
     .resize({ width: 1200, withoutEnlargement: true })
     .webp({ quality: 80 })
     .toBuffer();
   const result = await saveFile({ buffer: optimized, mimeType: 'image/webp' }, `products/${productId}`);
   newUrls.push(result.url);
6. Update Product.images = [...existing, ...newUrls]
7. Return ok({ images: updatedImages }, 201)
```

## Delete route — `/api/products/[id]/images/[filename]`

Removes from R2 + filters from `Product.images` array.

## CSP Headers — `next.config.ts`

R2 images + Facebook SDK require explicit allowlisting:

```ts
"img-src 'self' data: blob: https://images.nazhahatyai.com https://graph.facebook.com https://*.fbcdn.net",
"script-src 'self' 'unsafe-eval' 'unsafe-inline' https://connect.facebook.net",
"connect-src 'self' ws: wss: https://graph.facebook.com https://www.facebook.com",
```

**MAJOR change** — modifying CSP requires `dissent-4-bullet` (security boundary).

## next.config.ts images config

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'graph.facebook.com' },
    { protocol: 'https', hostname: '*.fbcdn.net' },
    { protocol: 'https', hostname: '**' },  // wildcard — review if tightened
  ],
}
```

Currently uses `<img>` tags directly (NOT `next/image`) so this section is not strictly enforced.

## URL pattern

```
https://images.nazhahatyai.com/products/<productId>/<hash>.webp
```

`<hash>` = `crypto.randomBytes(16).toString('hex')` — 32-char hex.

## Common pitfalls

- **Image upload "Internal server error"**: env vars not set on Vercel. Check Settings → Environment Variables.
- **Upload works but image doesn't display**: CSP `img-src` missing R2 domain. Check `next.config.ts`.
- **Buffer type error on Vercel build**: `new File([buffer], ...)` fails type check. Use `{ buffer, mimeType }` form of `saveFile()` instead.
- **Module not found `@/generated/prisma`**: was Turbopack issue earlier — RESOLVED, Next.js 16 build with Turbopack works (`--no-turbopack` flag is INVALID).
- **Build fails with `prisma generate`**: ensure `postinstall: "prisma generate"` runs on Vercel.

## Replacing R2 with Vercel Blob (NOT recommended)

500MB limit free → too small. Skip.
