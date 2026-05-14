# Local ops scripts policy

**Filed:** 2026-05-15

---

## 1. Why this exists

During earlier sessions Boss created three scripts to handle emergency
operations (Boss admin password rotation, Railway DB credential rotation,
debugging a user row):

- `scripts/check-user-full.ts` — read User row including bcrypt hash for
  debugging.
- `scripts/reset-admin-password.ts` — reset OWNER password via bcrypt.
- `scripts/rotate-db-password.ts` — rotate Railway Postgres credential.

These scripts:

- Touch credentials at runtime.
- Have no test coverage.
- Have no review history.
- Were intended for one-off use, not regular dev workflow.
- Should not be visible to future contributors / AI agents who might
  run them carelessly.

They have lived untracked in the working tree for several sessions,
producing constant `git status` noise + a small risk of accidental
`git add .` commit.

## 2. Decision

**Never commit these files.** Add explicit `.gitignore` entries by
file name so even an accidental `git add scripts/<name>.ts` is silently
ignored.

Boss may keep the files locally for emergency use OR move them outside
the repo entirely. Either is acceptable; the `.gitignore` entry covers
both cases (if files exist locally they stay invisible; if moved out,
nothing changes).

## 3. Implementation

`.gitignore` updated with three file-name lines:

```
# Local-only emergency ops scripts — never commit. See
# docs/superpowers/2026-05-15-local-ops-scripts-policy.md.
scripts/check-user-full.ts
scripts/reset-admin-password.ts
scripts/rotate-db-password.ts
```

## 4. Future ops tools

When adding new ops scripts that touch credentials / production data /
emergency procedures:

- Place under `scripts/` only if they need to import the project's TS
  modules + Prisma client.
- Add the file name to `.gitignore` in the same commit.
- Document the script's purpose + risk + run instructions in a doc
  under `docs/ops/<script-name>.md` (commit the doc, not the script).
- If multiple ops tools accumulate, consider extracting to a separate
  private repo `liveshop-ops` referenced only by documentation.

## 5. Backup hygiene cross-reference

The same rule applies to local database backup dumps:

- `backups/` is in `.gitignore` (line added during D1 runbook).
- Dump files retain SHA-256 + retention recommendation in
  `docs/superpowers/2026-05-14-hygiene-followups-disposition.md` § 3.
- Never upload to cloud / git / shared drive.

## 6. Cross-references

- D1 runbook: `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md` § 16
- Hygiene disposition: `docs/superpowers/2026-05-14-hygiene-followups-disposition.md`
- `.gitignore` change: this commit.
