---
title: Build Live Commerce Sales Management Dashboard
slug: live-commerce-sales-dashboard
status: backlog
priority: high
area: new-project
created: 2026-04-03
tags: [facebook, live-commerce, social-selling, dashboard, fullstack]
---

# Build Live Commerce Sales Management Dashboard

## Description

Deep research the V Rich App (masternivest.vrich619.com/sale) and build a superior **sales management dashboard for live commerce / social selling** integrated with Facebook.

## Reference

- Existing app: V Rich App v.3.6.11 (Thai live commerce platform)
- Features observed: sale management, order list, confirm transfer, checkout, pickup, chat, live video, inbox, post management, auto inbox, waiting list, broadcast tools

## Requirements

### Core Features (must be better than reference)

1. **Order Management**
   - Real-time order tracking and status updates
   - Order search, filtering, and bulk actions
   - Payment confirmation and transfer verification
   - Checkout and pickup workflows
   - Order history and analytics

2. **Stock Management**
   - Product catalog with variants (size, color, etc.)
   - Real-time inventory tracking
   - Low stock alerts and reorder points
   - Stock reservation during live sessions
   - Bulk import/export

3. **Customer Management (CRM)**
   - Customer profiles with purchase history
   - Customer segmentation and tagging
   - Loyalty tracking and repeat buyer insights
   - Address book management
   - Customer notes and communication history

4. **Real-Time Chat Support**
   - Facebook Messenger integration
   - Multi-channel inbox (Messenger, comments, DMs)
   - Chat templates and quick replies
   - Auto-reply and chatbot support
   - Chat assignment and team collaboration

5. **Facebook Live Support**
   - Live video management and scheduling
   - Real-time comment monitoring during live
   - Auto-capture orders from live comments (e.g., "CF" keyword)
   - Live product showcase with instant add-to-cart
   - Post-live order summary and processing

### Improvements Over Reference

- Modern, responsive UI (mobile-first)
- Better UX with clear navigation and workflows
- Real-time dashboards with analytics and insights
- Multi-language support
- API-first architecture for extensibility
- Proper role-based access control

## Technical Approach (TBD)

- Frontend: Next.js / React
- Backend: Node.js API
- Database: PostgreSQL
- Real-time: WebSockets
- Facebook API: Graph API + Webhooks
- Auth: OAuth 2.0 with Facebook Login

## Next Steps

1. Deep research the reference website (all pages/features)
2. Research Facebook Graph API capabilities for live commerce
3. Design system architecture and data models
4. Create project roadmap with phased milestones
5. Begin implementation
