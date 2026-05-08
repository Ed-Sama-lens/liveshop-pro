# 10 — Ops & Deploy

## Platform mix

| Service | Vendor | Purpose |
|---|---|---|
| App | Vercel | Next.js auto-deploy from `master` |
| Database | Railway | PostgreSQL — connection via `<RAILWAY_DATABASE_URL>`. Rotated 2026-05-09. |
| Redis | Railway | Bull queue, rate limit |
| Storage | Cloudflare R2 | Image assets (`images.nazhahatyai.com`) |
| Domain | Cloudflare | DNS + email routing |
| Email send | Resend | Order confirmations, slip notifications |
| Email receive | Cloudflare Email Routing | `contact@nazhahatyai.com` → Gmail forward |
| Auth (admin) | next-auth | self-hosted |
| Auth (customer) | Facebook Login | App ID `780277861568430` |
| Domain | nazhahatyai.com | Cloudflare-managed |

## Deploy flow

```
1. git push origin master
2. Vercel detects push → triggers build
3. Build steps (in /vercel/path0):
   a. npm install        (runs postinstall: prisma generate)
   b. npm run build      (prisma generate && next build)  ← uses Turbopack
4. Vercel deploys to https://nazhahatyai.com
5. Status: Building → Ready (or Error)
```

## Build configuration

`package.json`:
```json
"build": "prisma generate && next build"
```

Next.js 16 uses Turbopack by default. **Do NOT add `--no-turbopack`** — flag does not exist.

`postinstall: "prisma generate"` ensures Prisma client is generated even if `npm install` runs without `npm run build` (e.g. on CI cache).

## Vercel env vars

Required (see 01 for full list):

`DATABASE_URL` `REDIS_URL` `NEXTAUTH_URL` `NEXTAUTH_SECRET` `FACEBOOK_APP_ID` `FACEBOOK_APP_SECRET` `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET_NAME` `R2_PUBLIC_URL` `RESEND_API_KEY` `APP_AUTH_TOKEN`

Apply to: **All Environments** (Production, Preview, Development).

After adding env var → **Deployments → ⋮ → Redeploy** to take effect.

## Database migrations

Prisma migrations are NOT run automatically on Vercel deploy. Two options:

### Option A — db push (hotfix)
```
DATABASE_URL=postgresql://...railway... npx prisma db push
```

Skips migration history. Use for quick schema changes.

### Option B — migrate (proper)
```
DATABASE_URL=postgresql://...railway... npx prisma migrate dev --name <name>
git add prisma/migrations
git commit -m "feat(db): <migration>"
git push
# Then on production:
DATABASE_URL=postgresql://...railway... npx prisma migrate deploy
```

**WARNING**: `prisma migrate dev` creates migrations folder. `migrate deploy` applies them. `db push` does neither — direct schema sync.

## Logs

- **Vercel runtime logs**: Vercel Dashboard → Logs (filter by route)
- **Vercel build logs**: Deployments → click deployment → Build Logs
- **CLI**: `npx vercel logs <deployment-url>`

## Monitoring

No formal monitoring yet (no Sentry / DataDog / Logflare configured). Pino logs to stdout → captured by Vercel.

## Custom domain DNS

Cloudflare DNS for `nazhahatyai.com`:
- A / CNAME pointing to Vercel
- MX records for Email Routing (Cloudflare auto-managed)
- CNAME `images.nazhahatyai.com` → R2 bucket

## Rollback

Vercel → Deployments → find a previous **Ready** deployment → **Promote to Production**.

DB rollback: NOT automated. If migration broke prod, manually revert via SQL or restore Railway snapshot.

## Common deploy failures

| Error | Cause | Fix |
|---|---|---|
| `Type 'Buffer<ArrayBufferLike>' is not assignable to type 'BlobPart'` | `new File([buffer])` strict types | Use `{ buffer, mimeType }` form of `saveFile()` |
| `Module not found: Can't resolve '@/generated/prisma'` | `prisma generate` didn't run | Verify `postinstall` script |
| `error: unknown option '--no-turbopack'` | Invalid flag for Next.js 16 | Remove it from build script |
| `Validation failed` 400 on `/api/products?limit=200` | `limit` max is 100 | Reduce to ≤100 |
| API redirects to `/unauthorized` (307) | middleware checked `/api/*` | Verify `proxy.ts` skips `/api/` early |
| FB Login does nothing | CSP blocks SDK | Add `connect.facebook.net` to `script-src` |
| Image upload 500 | R2 env vars missing | Set on Vercel + redeploy |

## Pre-commit / CI

No CI config yet (no `.github/workflows/`). Boss verifies locally:
```
npx tsc --noEmit
npm run test
```

## Backup

DB: rely on Railway snapshots (managed). NO custom backup script yet.
R2: rely on Cloudflare durability. NO redundant backup.

Add backup workflow later if needed (R1).

## Health check

No `/health` or `/api/health` endpoint. To verify production:
```
curl -sI https://nazhahatyai.com/  → 200
curl -s https://nazhahatyai.com/api/storefront/nazha-hatyai/products  → returns products
```

## Telegram (optional)

Telegram plugin installed user-scope but NOT configured. Could be used for deploy notifications. Decision pending.
