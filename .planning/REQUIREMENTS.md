# Requirements: LiveShop Pro

## R1: Authentication & Authorization
- **R1.1** Facebook OAuth login for sellers
- **R1.2** Role-based access control (Owner, Manager, Chat Support, Warehouse)
- **R1.3** 2FA support
- **R1.4** Session management with NextAuth.js
- **R1.5** Team invitation system

## R2: Dashboard & Analytics
- **R2.1** Real-time sales overview (revenue, orders, customers today)
- **R2.2** Live sales metrics during broadcasts (viewers, orders/min, conversion)
- **R2.3** Product performance charts (top sellers, slow movers)
- **R2.4** Customer acquisition by channel
- **R2.5** Revenue reports (daily, weekly, monthly) with export
- **R2.6** Order status pipeline visualization

## R3: Sale / Live Selling
- **R3.1** Facebook Live video integration (start/stop/schedule broadcasts)
- **R3.2** Real-time comment monitoring during live
- **R3.3** Auto-capture orders from comments (CF keyword detection)
- **R3.4** Product showcase with live add-to-cart
- **R3.5** Post-based selling (Post, Post Auto)
- **R3.6** Add from stock to current sale session
- **R3.7** Broadcast experience templates
- **R3.8** Waiting list management
- **R3.9** Quick Add Product from Sale page (inline modal creates product in stock + adds to sale session instantly)
- **R3.10** Drag-and-drop customer allocation (drag Facebook profile from Messenger inbox / Live Chat panel → drop onto product allocation table → auto-assign item + send Messenger order confirmation)
- **R3.11** Visual Inventory Status in Sale view (color-coded: red = out of stock, blue = full stock, green = partially ordered but available)

## R4: Order Management
- **R4.1** Order creation (from live, chat, manual)
- **R4.2** Order list with advanced filtering (date, status, customer, channel)
- **R4.3** Order search by ID, customer name, tracking number
- **R4.4** Order status pipeline: Reserved -> Confirmed -> Packed -> Shipped -> Delivered
- **R4.5** Bulk order actions (confirm, print, export)
- **R4.6** Print order / packing slip
- **R4.7** Order notes and internal comments
- **R4.8** Order history and audit trail

## R5: Payment & Transfer Verification
- **R5.1** Manual transfer confirmation workflow
- **R5.2** Payment slip upload and OCR verification
- **R5.3** Auto-match slip amount to order total
- **R5.4** QR code payment generation (Bangkok Bank / PromptPay)
- **R5.5** Payment status tracking (Pending, Verified, Failed, Refunded)
- **R5.6** Idempotency keys for duplicate prevention
- **R5.7** Reconciliation reports

## R6: Stock / Product Management
- **R6.1** Product CRUD with variants (size, color, etc.)
- **R6.2** Product codes (stock code + sale code)
- **R6.3** Real-time inventory tracking with quantity, price, cost
- **R6.4** Low stock alerts and reorder points
- **R6.5** Stock reservation during live sessions (15-min hold)
- **R6.6** Bulk import/export (CSV/Excel)
- **R6.7** Product grouping and categorization
- **R6.8** Bulk edit capabilities
- **R6.9** Product images and descriptions
- **R6.10** Visual Inventory Status color indicators (red/blue/green) on stock lists and sale views

## R7: Customer Management (CRM)
- **R7.1** Customer profiles (name, address, phone, social accounts)
- **R7.2** Customer search with advanced filters
- **R7.3** Purchase history per customer
- **R7.4** Customer labels/tags and segmentation
- **R7.5** Ban customer functionality
- **R7.6** Sale channel tracking (Facebook, Instagram, LINE, etc.)
- **R7.7** Shipping type preferences per customer
- **R7.8** Customer notes and communication log
- **R7.9** Customer lifetime value tracking

## R8: Chat & Messaging
- **R8.1** Facebook Messenger integration via webhooks
- **R8.2** Real-time conversation inbox (multi-customer)
- **R8.3** Order history panel alongside chat
- **R8.4** Chat reply templates (saved quick replies)
- **R8.5** AI auto-reply for common questions
- **R8.6** Chat assignment to team members
- **R8.7** Unread message indicators and notifications
- **R8.8** File/image sharing in chat

## R9: Shipping & Logistics
- **R9.1** Shipping provider integration (KEX Express, J&T Express API)
- **R9.2** Tracking number assignment (manual + auto-generate)
- **R9.3** Checkout workflow (assign tracking -> mark shipped)
- **R9.4** Pickup management (parcel pickup status tracking)
- **R9.5** Shipping label / waybill printing
- **R9.6** Shipping rate calculation
- **R9.7** Delivery status tracking via provider API

## R10: Notifications & Real-Time
- **R10.1** WebSocket real-time updates for orders, chat, stock
- **R10.2** Browser push notifications
- **R10.3** Sound alerts for new orders and messages
- **R10.4** Email notifications for critical events
- **R10.5** Tab title badge for unread counts

## R11: Promotions (Future)
- **R11.1** Discount codes and flash sales
- **R11.2** Bundle pricing
- **R11.3** Loyalty program / repeat buyer discounts

## R12: Mobile & PWA (Future)
- **R12.1** Progressive Web App with offline support
- **R12.2** Push notifications on mobile
- **R12.3** Core flows optimized for mobile

## R13: Customer Self-Service (Future)
- **R13.1** Public order tracking page
- **R13.2** Payment slip upload by customer
- **R13.3** Order status notifications to customer

## R14: Storefront (Customer-Facing Shop)
- **R14.1** Public storefront page displaying products pulled from stock by Owner/Admin
- **R14.2** Customer Facebook OAuth login to browse and place orders
- **R14.3** Product catalog view with images, variants, pricing, and stock availability
- **R14.4** Shopping cart with add/remove/quantity update
- **R14.5** Checkout flow — creates order in system upon completion
- **R14.6** Post-checkout: auto-send order confirmation message to customer via Facebook Messenger API
- **R14.7** Admin storefront management — select which products to publish, set visibility, ordering
- **R14.8** Customer order history visible in storefront (after login)
- **R14.9** Storefront theming — shop branding (logo, colors, banner)

## Non-Functional Requirements
- **NF1** Page load < 2s on 3G connection
- **NF2** Real-time updates < 100ms latency
- **NF3** Support 10K concurrent users per seller account
- **NF4** 99.9% uptime
- **NF5** PDPA compliant (Thai data protection)
- **NF6** Responsive design (mobile-first)
- **NF7** Dark mode support
- **NF8** Thai + English + Chinese language support
