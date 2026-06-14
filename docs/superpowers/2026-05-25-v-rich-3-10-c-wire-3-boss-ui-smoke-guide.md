# V Rich Stage 3.10-C WIRE-3 — Boss UI Smoke Guide

**Filed:** 2026-05-25 (paired with WIRE-3 PR)
**For:** Boss UI visual review BEFORE WIRE-3 merge
**Time required:** ~15 min

This guide is for Boss visual + UX review of the V Rich board behind the layout-v2 flag. Boss runs locally OR via Vercel preview. **Claude must NOT perform any authenticated production UI action on Boss's behalf.**

---

## A. Safety reminders

| Rule | Detail |
|---|---|
| Boss performs the authenticated UI check | Claude provides instructions only |
| Do NOT paste secrets, cookies, storageState, tokens, private credentials into chat | Treat all such values as sensitive |
| Use LOCAL DEV or SAFE PREVIEW environment | NOT production until WIRE-5 default-on decision |
| NO production mutation during smoke | Read-only walkthrough |
| Take screenshots locally + share via file attachment (not paste secrets) | Annotate any issues |

---

## B. Setup options

### Option 1 (RECOMMENDED) — Local dev with `.env.local`

Safest. Zero production touch. Boss runs:

1. Open terminal in `liveshop-pro/`:
   ```bash
   cd /c/Users/Asus/COWORK/code/liveshop-pro
   ```
2. Create or edit `.env.local` (Boss-owned, NEVER committed):
   ```
   NEXT_PUBLIC_SALE_LAYOUT_V2=true
   ```
3. Start dev server:
   ```bash
   npm run dev
   ```
4. Open browser: `http://localhost:3000/sign-in`
5. Sign in as Boss admin account
6. Navigate `/sale`
7. Perform §C steps
8. When done: edit `.env.local` → set `NEXT_PUBLIC_SALE_LAYOUT_V2=false` (or remove line) → restart dev server to confirm flag-off behavior

### Option 2 (DEFER) — Vercel preview env flag

Only if Boss explicitly approves AFTER Option 1 confirms safety. Per Decision Packet §F (PR #151):

1. Go to https://vercel.com → liveshop-pro project → Settings → Environment Variables
2. Add `NEXT_PUBLIC_SALE_LAYOUT_V2` = `true`
3. Check ONLY **Preview** environment (NOT Production)
4. Redeploy preview branch
5. Open preview URL → sign in → `/sale`
6. After review: set value to `false` or delete the env var

**Do NOT set Production env yet.** WIRE-5 (default-on decision) is a separate PR with ≥1 week stability gate.

### Option 3 (HELD) — Production env

NOT for WIRE-3. Requires explicit Boss authorization in a separate decision after WIRE-3 + WIRE-4 stable.

---

## C. Step-by-step UI check

### Pre-flight

- [ ] Confirm logged in as admin (OWNER or MANAGER role)
- [ ] Confirm on safe environment (local OR preview, NOT production)
- [ ] Open browser DevTools console (Ctrl+Shift+J / Cmd+Opt+J) — watch for errors

### Walkthrough

1. **Open `/sale`** → page loads without console errors
2. **Confirm or select `saleDate`** in header date picker (defaults to today)
3. **Observe LEGACY Product Codes panel** (existing UI):
   - [ ] Renders BroadcastProduct rows for the saleDate
   - [ ] Add from Stock + Quick Create dialogs still work (do NOT click submit — read-only verification)
4. **Observe NEW V Rich board** (below the primary grid, before secondary surface):
   - [ ] Title: "Sale Board (V Rich style) — preview"
   - [ ] Pills render in V Rich natural order (CM1, CM2, CM10 — not CM1, CM10, CM2)
   - [ ] Pill shows displayCode + stock badge `(N/Total)` or `(N)`
   - [ ] Empty saleDate → "ยังไม่มีรหัสสินค้าในวันที่ขายนี้"
   - [ ] Out-of-stock pill renders distinct color
5. **Click pill** → drawer expands below pill row:
   - [ ] Header shows `displayCode productName RM10.00 (N/Total)`
   - [ ] Slots render: filled with customer name OR empty placeholder
   - [ ] Click expanded pill AGAIN → drawer collapses
6. **Confirm read-only**:
   - [ ] NO drag handle on any pill or slot
   - [ ] Empty slot click → no dialog opens, no error
   - [ ] No mutation buttons in the board region (no "Confirm" / "Cancel" / "Convert" in board itself — those still live in Booking Queue panel)
7. **Confirm existing surfaces UNCHANGED**:
   - [ ] Booking Queue panel renders + mutation buttons still work (do NOT click submit on prod data unless test record)
   - [ ] Customer panel renders
   - [ ] Order Conversion panel renders
   - [ ] Sale Summary panel renders
   - [ ] Live Sessions picker accordion (bottom) renders
8. **Mobile check** (if practical):
   - [ ] Resize browser to 375px width OR open DevTools mobile mode
   - [ ] Board pills wrap to multiple rows (QF.1 default)
   - [ ] Layout doesn't horizontal-scroll inappropriately
9. **Flag-off regression check** (after step 7):
   - [ ] Edit `.env.local` → `NEXT_PUBLIC_SALE_LAYOUT_V2=false`
   - [ ] Restart dev server (Ctrl+C + `npm run dev`)
   - [ ] Refresh `/sale`
   - [ ] V Rich board DISAPPEARS entirely
   - [ ] Legacy Product Codes panel is identical to before WIRE-3 was added
   - [ ] No console errors

### Report back to Claude

- [ ] All steps passed? → reply `WIRE-3 UI smoke PASS — merge approved`
- [ ] Any visual issue? → describe + attach screenshot (NOT paste secrets/cookies)
- [ ] Console errors? → paste error TEXT (NOT stack traces with credentials)
- [ ] Wrong count / missing product / confusing copy? → flag specific pill displayCode + describe

---

## D. Compact UI smoke workbook v5 — quick-pass

Workbook v5 (A–L sections) is owed from earlier blocks. For WIRE-3 merge, only a SUBSET is essential. The rest can defer until WIRE-5 (default-on) decision.

### Essential before WIRE-3 merge (~10 min)

- [ ] **Section A** (legacy Product Codes) — confirm UNCHANGED with flag off
- [ ] **Section B** (Booking Queue) — confirm UNCHANGED with flag off
- [ ] **§C above** (V Rich board walkthrough) — full read-only check with flag on

### Deferrable until WIRE-5

- [ ] **Section C** (AddFromStock multi-select)
- [ ] **Section D** (same/diff date conflict)
- [ ] **Section E** (Terminal bookings + history)
- [ ] **Section F** (Order detail)
- [ ] **Section G** (`/inventory/new` Quick form)
- [ ] **Section H** (Bulk inventory — N/A per prior PR)
- [ ] **Section I** (Sale Summary single-day)
- [ ] **Section J** (Sale Summary range)
- [ ] **Section K** (Compact summary panel)
- [ ] **Section L** (`/inventory/new` bulk range UI)

### Evidence to report back

| Type | How to share |
|---|---|
| PASS | Reply `WIRE-3 UI smoke PASS — merge approved` |
| Visual issue | Attach screenshot file (drag into chat) — do NOT paste base64 |
| Console error | Paste error text only (strip stack traces with credentials) |
| Layout broken | Describe viewport size + browser |
| Performance | Note time to first pill render |

### What NOT to share

- ❌ Browser cookies / session tokens
- ❌ `storageState` JSON
- ❌ Database connection strings
- ❌ Vercel env values
- ❌ Personal customer data from screenshots (blur if needed)
- ❌ `.env.local` file contents

---

## E. Rollback if WIRE-3 misbehaves

1. **Locally:** edit `.env.local` → `NEXT_PUBLIC_SALE_LAYOUT_V2=false` → restart dev server
2. **Vercel preview:** Vercel Dashboard → Environment Variables → delete `NEXT_PUBLIC_SALE_LAYOUT_V2` → redeploy
3. **Production (if accidentally set):** delete env var → redeploy. Board hides immediately.

Board is gated entirely on the env flag. No DB state. No persistent config. Rollback = flip env + redeploy.

---

## F. After Boss approval

Once Boss replies `WIRE-3 UI smoke PASS — merge approved`:

1. Claude merges WIRE-3 PR
2. Master deploys to Vercel
3. **Vercel env stays UNSET on Production** — board does NOT appear on production
4. Boss may later set `NEXT_PUBLIC_SALE_LAYOUT_V2=true` on **Vercel Preview** for ongoing review
5. WIRE-4 (Playwright + integration tests) opens next
6. WIRE-5 (default-on / legacy removal) deferred ≥1 week prod stability

---

## G. Status

| Item | Status |
|---|---|
| WIRE-3 code shipped | ✅ (this PR) |
| Flag default false | ✅ (verified via flag-off test) |
| Production env untouched | ✅ |
| Boss UI smoke required | ⏸ pending Boss execution |
| Production deploy | unchanged until Boss verdict |
| pak-ta-kra | untouched |

R2 — docs only (this guide). No production change. No secrets requested.
