# Hygiene follow-ups — disposition proposal

**Filed:** 2026-05-14
**Status:** Recommendation only. No commits / pushes from this doc.

---

## 1. Emergency scripts (untracked in repo root)

Three files have lived untracked in `scripts/` since the password-rotation incident in an earlier session:

| File | Purpose | Risk |
|---|---|---|
| `scripts/check-user-full.ts` | Print full User row including hash for debugging | LOW (read-only) but exposes auth schema if run carelessly |
| `scripts/reset-admin-password.ts` | Reset OWNER password via bcrypt hash | HIGH (writes auth credentials) |
| `scripts/rotate-db-password.ts` | Rotate Railway Postgres credential | HIGH (writes Railway env + DB password) |

### Recommendation: move outside repo

Move all three to `~/.liveshop-ops/scripts/` (or any path outside the git working tree). Reasons:

1. They contain credential-touching code paths that should not be visible to future contributors / AI agents.
2. They were never intended for normal development workflow.
3. They have no test coverage and no review history.
4. Keeping them untracked indefinitely produces git noise on every `git status` for as long as the repo exists.

**Boss action:**

```powershell
$dest = "$env:USERPROFILE\.liveshop-ops\scripts"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Move-Item "C:\Users\Asus\COWORK\code\liveshop-pro\scripts\check-user-full.ts" -Destination $dest
Move-Item "C:\Users\Asus\COWORK\code\liveshop-pro\scripts\reset-admin-password.ts" -Destination $dest
Move-Item "C:\Users\Asus\COWORK\code\liveshop-pro\scripts\rotate-db-password.ts" -Destination $dest
```

Then add to `.gitignore` defensively in case anyone re-creates them:

```
# Emergency ops scripts (live outside repo at ~/.liveshop-ops/scripts/)
scripts/check-user-full.ts
scripts/reset-admin-password.ts
scripts/rotate-db-password.ts
```

### Alternative: secure ops toolkit

Long-term: create a private repo `liveshop-ops` for credential-touching scripts. Reference from main repo via documentation only. Out of scope for this doc.

### Status until Boss decision

Files stay untracked + uncommitted. No `git add` from any future commit. `.gitignore` is fine as-is for now; the files do not show as staged changes in any PR.

## 2. robots.txt follow-up branch

`docs/robots-middleware-gated-followup` branch was created earlier with one commit `c498914 docs(seo): note robots middleware gating follow-up`. The branch is local only — not pushed.

### Observation

`GET /robots.txt` on production still returns `307 → /auth/sign-in?callbackUrl=%2Frobots.txt`. Same behavior as pre-D1. PR 2 made no middleware changes (correct — out of scope).

### Recommendation: push branch + open separate PR

The follow-up doc is high-quality and contains a clear suggested matcher pattern. Pushing as a docs-only PR:

- Preserves the audit trail (someone in 6 months will find it via git log + PR list).
- Doesn't risk PR 2's review record (separate PR, separate diff).
- Doesn't touch any code.

**Steps when Boss approves:**

```powershell
cd C:\Users\Asus\COWORK\code\liveshop-pro
git push -u origin docs/robots-middleware-gated-followup
gh pr create --base master --head docs/robots-middleware-gated-followup `
  --title "docs(seo): note robots middleware gating follow-up" `
  --body-file docs/superpowers/followups/2026-05-14-public-robots-middleware-gated.md
```

### Alternative: hold local

Leave the branch local until a real `/robots.txt` fix PR is also ready. Then merge the doc + the code fix in a single PR. Risk: the local branch might be forgotten or accidentally deleted.

### Status until Boss decision

Branch stays local. No push from this run.

## 3. Backup dump

Already addressed by `45f0c52 chore(gitignore): ignore local database backups`. The file `backups/backup-pr2-d1-20260514-132409.dump` remains at:

```
C:\Users\Asus\COWORK\code\liveshop-pro\backups\backup-pr2-d1-20260514-132409.dump
```

with SHA-256 `151f5cb6b24063516e7f1e7050bed64fcaa1b585735e99dd8c5947b7a4df5cae` and size 117 KB.

### Retention recommendation

- Keep for 30 days after D6 ships, then delete.
- Move to a separate encrypted location if Boss wants long-term archive.
- Never upload to cloud / git / shared drive.
- Future D-day operations (D6, D7, etc) should create fresh snapshots, not reuse this one.

## 4. Summary

| Item | Action | Owner |
|---|---|---|
| Emergency scripts | Move out of repo + add defensive .gitignore | Boss |
| robots.txt follow-up branch | Push + open separate PR (recommended) OR hold | Boss decision |
| Backup dump | Keep local 30d + delete | Boss schedule |
| `.gitignore backups/` | DONE (commit `45f0c52` on `chore/post-d3-hygiene-docs`) | — |

No production action from this doc.
