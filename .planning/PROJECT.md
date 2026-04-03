# Project: LiveShop Pro

## Overview
A modern, full-stack live commerce sales management dashboard for Facebook sellers. Significantly better than V Rich App with real-time capabilities, AI features, and multi-channel support.

## Problem Statement
Thai Facebook live sellers currently use V Rich App which has dated UI, manual workflows, no analytics, and limited automation. They need a modern platform that handles the full live selling lifecycle: broadcasting, order capture, payment verification, shipping, and customer management.

## Target Users
- Thai Facebook live sellers (primary)
- Small-medium e-commerce businesses selling via social media
- Team members: owners, managers, chat support, warehouse staff

## Key Differentiators vs V Rich App
1. Modern, responsive UI (mobile-first with dark mode)
2. Real-time analytics dashboard
3. AI-powered auto-reply for Messenger
4. Automated payment slip verification (OCR)
5. Multi-channel ready (Facebook + Instagram + TikTok future)
6. Team collaboration with role-based access
7. Promotion engine for flash sales
8. Customer self-service portal

## Tech Stack
- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express + Socket.IO
- **Database:** PostgreSQL 16 + Redis 7.2 + Prisma ORM
- **Queue:** Bull (Redis-based)
- **State:** TanStack Query v5 + Zustand
- **Auth:** NextAuth.js with Facebook OAuth
- **Testing:** Vitest + Playwright + Testing Library

## Created
2026-04-03
