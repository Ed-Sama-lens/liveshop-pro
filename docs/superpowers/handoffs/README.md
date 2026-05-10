# Session handoffs — index

Living index of Claude-Code session handoff docs for liveshop-pro. Most recent on top. Each entry links to the full handoff and gives a one-line hook so future sessions can pick which one to read first.

When adding a handoff:
1. File name: `YYYY-MM-DD-resume-<short-tag>.md`
2. Add a row at the TOP of the table below
3. Keep the hook under ~120 chars

## Index

| Date | Doc | Hook |
|---|---|---|
| 2026-05-11 | [resume-after-sale-shell](2026-05-11-resume-after-sale-shell.md) | /sale shell (2L-a) + 6-panel workspace skeleton (2L-b) shipped overnight; no /sale UI mutations wired, awaits review. |
| 2026-05-10 | [resume-after-2M-c-await-2N-approval](2026-05-10-resume-after-2M-c-await-2N-approval.md) | 2M-c replay integrity patch shipped; createManual replay validates active-reservation cardinality. Pre-2N. |
| 2026-05-10 | [resume-after-2M-a-await-2M-b-approval](2026-05-10-resume-after-2M-a-await-2M-b-approval.md) | 2M-a `_runConfirmInTx` extract shipped; 2M-b createManual runtime pending Boss + ChatGPT GO. |

## Conventions

- Handoffs are time-stamped on the GMT+7 calendar day work happened.
- "Resume" prefix means: pick this up after Boss returns + reviews the named commit.
- Doc body usually contains:
  1. State at handoff (HEAD, working tree, smoke status)
  2. Completed commits since last handoff
  3. Backend + UI capability snapshot
  4. Pending risks
  5. Exact next recommended commit
  6. No-go scopes
  7. Verification commands
  8. pak-ta-kra zero-touch reminder
  9. Section 12 copy-paste bootstrap block for the next prompt

## Related

- Sale API map: [docs/sale-api-map.md](../../sale-api-map.md)
- Project codemap: [docs/CODEMAP/README.md](../../CODEMAP/README.md)
- Top-level project rules: [CLAUDE.md](../../../CLAUDE.md), [AGENTS.md](../../../AGENTS.md)
