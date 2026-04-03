# Project State: LiveShop Pro

## Current Phase
Phase 1 — Foundation & Infrastructure (Planned, Ready to Execute)

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation & Infrastructure | planned (8 plans, 4 waves) |
| 2 | Product & Stock Management | not_started |
| 3 | Customer Management (CRM) | not_started |
| 4 | Order Management & Payment Verification | not_started |
| 5 | Chat & Messaging (Facebook Messenger) | not_started |
| 6 | Live Selling & Broadcasting | not_started |
| 7 | Shipping & Logistics | not_started |
| 8 | Analytics Dashboard & Notifications | not_started |
| 9 | Storefront (Customer-Facing Shop) | not_started |

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-03 | Next.js 16 + React 19 frontend | SSR, App Router, API routes for webhooks |
| 2026-04-03 | PostgreSQL + Prisma ORM | Transaction support critical for inventory; type-safe queries |
| 2026-04-03 | Socket.IO for real-time | Fallback support, room broadcasting, mature ecosystem |
| 2026-04-03 | TanStack Query + Zustand for state | TanStack handles server state (80%); Zustand for UI state |
| 2026-04-03 | Bull queue for async processing | Webhook handlers must return fast; payment verification async |
| 2026-04-03 | shadcn/ui for components | Full code ownership, dashboard templates, pairs with Tailwind |
| 2026-04-03 | Storefront as Phase 9 | Customer-facing shop with Facebook login, cart, Messenger order confirmation |
| 2026-04-03 | i18n Thai + English + Chinese | Malaysian customers need Chinese; admin team needs Thai; English as default |
| 2026-04-03 | CUSTOMER role in RBAC | Separate from seller roles; only accesses /store/* public routes |
| 2026-04-03 | Quick Add Product in Sale view | Inline modal creates product in stock + adds to sale session in one action |
| 2026-04-03 | Drag & Drop allocation in Phase 6 | Drag Facebook profile → product allocation → auto Messenger confirmation |
| 2026-04-03 | Visual Inventory Status colors | Red=out of stock, Blue=full stock, Green=partially ordered |

## Blockers
None

## Next Action
Run `/gsd:execute-phase 1` to start executing Phase 1: Foundation & Infrastructure
