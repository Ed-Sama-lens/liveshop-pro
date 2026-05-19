# Local artifact cleanup policy

**Filed:** 2026-05-18
**Status:** docs + `.gitignore` patch. No runtime change.

This file documents what kinds of local files must NEVER be committed and codifies the `.gitignore` rules that enforce it.

---

## 1. Categories of local-only files

| Category | Examples | Why never commit |
|---|---|---|
| Auth state | `tests/e2e/.auth/state.json` | Contains session cookie — token-equivalent |
| Backup snapshots | `backups/backup-pr2-d1-20260514-132409.dump` | Postgres dump — contains all production data |
| Emergency ops scripts | `scripts/check-user-full.ts`, `scripts/reset-admin-password.ts`, `scripts/rotate-db-password.ts` | Run with elevated DB access at runtime — not safe to share |
| Playwright artifacts | `test-results/`, `playwright-report/`, `tests/e2e/screenshots/` | May contain screenshots of real customer data + traces |
| Transient scratch files | `tmp-smoke-curl.sh`, `.pr-body-foo`, `.commit-msg.tmp` | Drafting noise; no review value |
| IDE / OS detritus | `.DS_Store`, `.vscode/launch.json` | Personal config |
| Env files | `.env`, `.env.local`, `.env.production` | Secrets |
| User-uploaded content | `public/uploads/` | Real customer uploads if dev runs prod-mirror |
| Generated Prisma client | `src/generated/prisma/` | Build artifact |
| Build output | `.next/`, `out/`, `build/` | Per-environment build |
| Local notes | `test note/`, `notes/` | Boss working notes; not project state |

---

## 2. Current `.gitignore` coverage (verified 2026-05-18)

| Pattern | Source | Covers |
|---|---|---|
| `/node_modules` | line 4 | deps |
| `/.next/` | line 17 | build |
| `/build` | line 21 | build |
| `*.pem` | line 25 | certs |
| `.env`, `.env.local`, `.env.*.local` | lines 34-36 | secrets |
| `!.env.example` | line 37 | example allowed |
| `.vercel` | line 40 | Vercel CLI |
| `next-env.d.ts` | line 44 | TS auto-gen |
| `/src/generated/prisma` | line 46 | Prisma client |
| `/public/uploads/` | line 49 | user uploads |
| `.claude/` | line 52 | Claude state |
| `tests/e2e/.auth/` | line 58 | auth storageState |
| `tests/e2e/screenshots/` | line 59 | screenshots |
| `test-results/` | line 60 | Playwright |
| `playwright-report/` | line 61 | Playwright |
| `backups/` | line 62 | DB dumps |
| `scripts/check-user-full.ts` | line 66 | ops script |
| `scripts/reset-admin-password.ts` | line 67 | ops script |
| `scripts/rotate-db-password.ts` | line 68 | ops script |
| `.pr-body-*` | line 73 (this PR) | scratch PR drafts |
| `.commit-msg.tmp` | line 74 (this PR) | scratch commit msg |
| `tmp-*.sh` | line 75 (this PR) | scratch shell |
| `tmp-*.ts` | line 76 (this PR) | scratch TS |
| `tmp-*.json` | line 77 (this PR) | scratch JSON |

NOT covered (Boss-only — leave alone):

- `test note/` — Boss working notes. Shown as untracked in `git status`. Boss can decide to ignore or stash; not Claude's call.

---

## 3. Backup dump retention

`backups/backup-pr2-d1-20260514-132409.dump`:

- Size: 117KB
- SHA-256: `151f5cb6b24063516e7f1e7050bed64fcaa1b585735e99dd8c5947b7a4df5cae`
- Origin: pre-D1 Railway production `pg_dump -Fc` via Docker `postgres:18-alpine`
- Retention: 30 days post-D6 success → Boss deletes
- Status: gitignored via `backups/`
- **NEVER upload, commit, print contents, or share**

Claude can NOT delete this file without Boss approval. If Boss decides to delete:

```bash
# Boss runs locally; not in Claude's authority
ls -la backups/
shred -u backups/backup-pr2-d1-20260514-132409.dump  # Linux
# OR
rm backups/backup-pr2-d1-20260514-132409.dump  # Windows / macOS
```

---

## 4. Emergency scripts retention

Three scripts permanently gitignored:

- `scripts/check-user-full.ts`
- `scripts/reset-admin-password.ts`
- `scripts/rotate-db-password.ts`

Existing policy: `docs/superpowers/2026-05-15-local-ops-scripts-policy.md`.

These scripts:
- Touch production credentials at runtime
- Are not safe to share even within the repo
- Bypass admin UI authorization layer

Boss may move them outside the repo entirely (e.g. to `~/Boss-Ops/scripts/`). Until Boss does, gitignore covers them.

---

## 5. Test artifacts retention

After every smoke run, Playwright may produce:

- `test-results/<test-name>/` with trace, video, screenshot if `retain-on-failure` is on
- `playwright-report/index.html`

These are gitignored. If a smoke run produces real data screenshots (e.g. authenticated Phase A spec), Boss must:

1. Review the screenshot for sensitive content before sharing
2. Delete after Boss's own review is done
3. Never upload to a PR

If Claude needs to refer to a screenshot, Boss should describe it in chat, not attach.

---

## 6. Daily / weekly cleanup tasks

### Daily (Boss optional)

- Remove any `tmp-*.{sh,ts,json}` from repo root (gitignored but takes space)
- Remove `.pr-body-*` files from prior drafts
- Verify `git status` shows only files Boss intends to commit

### Weekly (Boss recommended)

- Inspect `tests/e2e/.auth/`, `tests/e2e/screenshots/`, `test-results/`, `playwright-report/` sizes; clear if > 100MB
- Inspect `backups/` retention; delete dumps older than 30 days post-D6 success
- Inspect `.claude/` cache size; safe to clear if > 500MB (Claude rebuilds)

### Monthly

- Re-run `git check-ignore -v` on the file types listed in § 1 to verify gitignore drift
- If new categories of local-only files emerge, add patterns + amend this doc

---

## 7. When in doubt

If Boss or Claude is unsure whether a file is safe to commit:

1. Run `git check-ignore -v <path>` — if matched, it's already protected
2. If NOT matched, check § 1 categories — if matches any, add to gitignore first
3. If neither — read the file. If it has any of: secret keys, customer names, email addresses, phone numbers, payment slips, session tokens, internal URLs → do NOT commit. Add to gitignore.
4. If still unsure → ask Boss before staging.

---

## 8. Hard no-go

- ❌ Do NOT delete `backups/` contents without Boss approval
- ❌ Do NOT delete `scripts/check-user-full.ts` etc. without Boss approval
- ❌ Do NOT modify `tests/e2e/.auth/state.json` (Boss's session)
- ❌ Do NOT clear `.claude/` if Boss has unsaved Claude state
- ❌ Do NOT `git rm` any gitignored file just because it shows in `git status` (likely Boss-tracked locally)

---

## 9. Cross-references

- Emergency scripts policy: `docs/superpowers/2026-05-15-local-ops-scripts-policy.md`
- Session handoff: `docs/superpowers/2026-05-15-session-handoff-for-next-claude.md`
- `.gitignore` (line numbers may shift if file changes)
