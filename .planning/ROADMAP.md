# Roadmap: LiveShop Pro

## Phase 1: Foundation & Infrastructure
**Goal:** Project scaffolding, database schema, authentication, and base UI layout.
**Requirements:** R1.1, R1.2, R1.4, R10.1, NF1, NF6, NF7, NF8 (R1.3 2FA and R1.5 Team invitations deferred to post-Phase 1)
**Estimated effort:** Large

### Deliverables
- Next.js 16 project with TypeScript, Tailwind, shadcn/ui
- PostgreSQL database with Prisma schema (all core tables)
- Redis setup for caching and queues
- NextAuth.js with Facebook OAuth
- Role-based access control (RBAC)
- Base layout: sidebar navigation, header, responsive shell
- Dark mode toggle
- i18n setup (Thai + English + Chinese)
- CI/CD pipeline with Vitest

### Success Criteria
- [ ] User can log in with Facebook OAuth
- [ ] Role-based access restricts pages per role
- [ ] Database migrations run cleanly
- [ ] Base layout renders on mobile and desktop
- [ ] Dark mode works across all base components
- [ ] i18n works for Thai, English, and Chinese
- [ ] 80%+ test coverage on auth and RBAC

---

## Phase 2: Product & Stock Management
**Goal:** Full product catalog with inventory tracking, variants, and bulk operations.
**Requirements:** R6.1-R6.9
**Estimated effort:** Medium

### Deliverables
- Product CRUD (create, read, update, delete)
- Product variants (size, color, etc.)
- Stock quantity tracking with real-time updates
- Low stock alerts
- Product grouping/categorization
- Bulk import/export (CSV)
- Bulk edit
- Product images upload
- Search by product code, sale code, description
- Visual Inventory Status color indicators (red = out of stock, blue = full stock, green = partially ordered)

### Success Criteria
- [ ] Create product with variants and images
- [ ] Stock quantity updates in real-time
- [ ] CSV import creates products correctly
- [ ] Low stock alert triggers at threshold
- [ ] Bulk edit updates multiple products
- [ ] Visual Inventory Status shows correct color per stock level
- [ ] 80%+ test coverage

---

## Phase 3: Customer Management (CRM)
**Goal:** Customer profiles, search, segmentation, and purchase history.
**Requirements:** R7.1-R7.9
**Estimated effort:** Medium

### Deliverables
- Customer profiles with full details
- Advanced search and filtering
- Customer labels/tags
- Purchase history per customer
- Ban customer functionality
- Sale channel tracking
- Shipping preferences
- Customer lifetime value calculation
- Customer notes

### Success Criteria
- [ ] Create/edit customer profiles
- [ ] Search by any field (name, phone, address, tag)
- [ ] View purchase history with totals
- [ ] Ban/unban customer works
- [ ] Customer LTV calculated correctly
- [ ] 80%+ test coverage

---

## Phase 4: Order Management & Payment Verification
**Goal:** Full order lifecycle from creation to payment confirmation with slip OCR.
**Requirements:** R4.1-R4.8, R5.1-R5.7
**Estimated effort:** Large

### Deliverables
- Order creation (manual, from chat, from live)
- Order status pipeline: Reserved -> Confirmed -> Packed -> Shipped -> Delivered
- Order list with advanced filtering and sorting
- Order search
- Bulk order actions
- Print order / packing slip
- Payment transfer confirmation workflow
- Payment slip upload with OCR verification
- Auto-match slip to order amount
- QR code payment generation (PromptPay)
- Idempotency for duplicate prevention
- Stock reservation with 15-min expiry
- Order notes and audit trail

### Success Criteria
- [ ] Create order and reserve stock atomically
- [ ] Stock releases after 15-min if unpaid
- [ ] Payment slip OCR extracts amount correctly (>95%)
- [ ] Order status transitions work end-to-end
- [ ] Bulk confirm/print works for 100+ orders
- [ ] No overselling under concurrent load (tested)
- [ ] 80%+ test coverage

---

## Phase 5: Chat & Messaging (Facebook Messenger)
**Goal:** Real-time Messenger inbox with order context, templates, and AI auto-reply.
**Requirements:** R8.1-R8.8
**Estimated effort:** Large

### Deliverables
- Facebook Messenger webhook integration
- Real-time conversation inbox
- Message send/receive
- Order history panel alongside chat
- Chat reply templates (saved quick replies)
- AI auto-reply for common questions
- Chat assignment to team members
- Unread indicators and notifications
- File/image sharing

### Success Criteria
- [ ] Receive messages in real-time via webhook
- [ ] Send replies through Messenger API
- [ ] Order history shows when clicking customer
- [ ] Auto-reply responds to "how much" and "shipping status" queries
- [ ] Team member can be assigned to conversation
- [ ] Unread badge updates in real-time
- [ ] 80%+ test coverage

---

## Phase 6: Live Selling & Broadcasting
**Goal:** Facebook Live integration with real-time comment capture and order automation.
**Requirements:** R3.1-R3.8
**Estimated effort:** Large

### Deliverables
- Facebook Live video integration
- Live stream scheduling
- Real-time comment monitoring
- CF keyword auto-capture for orders
- Product showcase during live
- Add products from stock to live session
- Broadcast templates
- Post-live order summary
- Waiting list management
- Quick Add Product from Sale page (inline modal → stock + sale session)
- Drag-and-drop customer allocation (drag Facebook profile → product allocation table → auto Messenger confirmation)
- Visual Inventory Status in Sale/Live view (color-coded stock levels)

### Success Criteria
- [ ] Start/stop live broadcast from dashboard
- [ ] Comments appear in real-time during live
- [ ] "CF" comment creates order automatically
- [ ] Products shown with live add-to-cart
- [ ] Post-live summary shows all orders captured
- [ ] Quick Add creates product in stock and adds to sale in one action
- [ ] Drag-and-drop assigns item and sends Messenger confirmation
- [ ] Stock color indicators update in real-time during sale/live
- [ ] 80%+ test coverage

---

## Phase 7: Shipping & Logistics
**Goal:** Shipping provider integration, tracking, checkout workflow, and pickup management.
**Requirements:** R9.1-R9.7
**Estimated effort:** Medium

### Deliverables
- KEX Express API integration
- J&T Express API integration
- Tracking number assignment (manual + auto)
- Checkout workflow (assign tracking -> ship)
- Pickup management with status tracking
- Shipping label printing
- Delivery status tracking
- Shipping rate calculation

### Success Criteria
- [ ] Generate tracking number via KEX/J&T API
- [ ] Checkout flow assigns tracking and marks shipped
- [ ] Pickup status updates from carrier API
- [ ] Print shipping label
- [ ] Delivery status syncs from carrier
- [ ] 80%+ test coverage

---

## Phase 8: Analytics Dashboard & Notifications
**Goal:** Real-time analytics, reports, and notification system.
**Requirements:** R2.1-R2.6, R10.1-R10.5
**Estimated effort:** Medium

### Deliverables
- Real-time sales dashboard (revenue, orders, customers)
- Live selling metrics (viewers, conversion, orders/min)
- Product performance charts
- Customer acquisition by channel
- Revenue reports with export (CSV/PDF)
- Order status pipeline visualization
- WebSocket real-time updates
- Browser push notifications
- Sound alerts
- Email notifications
- Tab title unread badge

### Success Criteria
- [ ] Dashboard updates every 5 seconds during live
- [ ] Revenue chart shows daily/weekly/monthly trends
- [ ] Top products chart accurate
- [ ] Push notification fires on new order
- [ ] Sound plays on new chat message
- [ ] Report exports correctly
- [ ] 80%+ test coverage

---

## Phase 9: Storefront (Customer-Facing Shop)
**Goal:** Public-facing storefront where customers login via Facebook, browse products, and place orders with Messenger confirmation.
**Requirements:** R14.1-R14.9
**Dependencies:** Phase 2 (products), Phase 5 (Messenger API)
**Estimated effort:** Large

### Deliverables
- Public storefront page with product catalog
- Customer Facebook OAuth login (separate from seller login)
- Shopping cart with add/remove/quantity
- Checkout flow → order creation → Messenger confirmation
- Admin storefront management (publish/unpublish products, visibility, ordering)
- Customer order history in storefront
- Storefront theming (logo, colors, banner per shop)
- Mobile-responsive storefront layout

### Success Criteria
- [ ] Customer can browse storefront without login
- [ ] Customer logs in via Facebook and places order
- [ ] Checkout creates order and sends Messenger confirmation
- [ ] Admin publishes/unpublishes products to storefront
- [ ] Storefront displays correct stock availability
- [ ] Customer can view order history after login
- [ ] Storefront renders correctly on mobile
- [ ] 80%+ test coverage

---

## Future Phases (Post-MVP)

### Phase 10: Promotions & Loyalty
- Discount codes, flash sales, bundles
- Loyalty program, repeat buyer rewards
- Requirements: R11.1-R11.3

### Phase 11: Mobile PWA
- Progressive Web App
- Mobile push notifications
- Offline support
- Requirements: R12.1-R12.3

### Phase 12: Customer Self-Service Portal
- Public order tracking
- Customer payment upload
- Order notifications
- Requirements: R13.1-R13.3

### Phase 13: Multi-Channel Expansion
- Instagram integration
- TikTok Shop integration (when available)
- LINE integration
- Unified inventory sync across all channels
