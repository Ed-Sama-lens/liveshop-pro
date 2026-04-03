---
phase: 1
reviewers: [security-reviewer, architect]
reviewed_at: 2026-04-03T11:15:00Z
plans_reviewed: [01-PLAN-01, 01-PLAN-02, 01-PLAN-03, 01-PLAN-04, 01-PLAN-05, 01-PLAN-06, 01-PLAN-07]
---

# Cross-AI Plan Review — Phase 1

## Security Review

### Summary
Phase 1 establishes a solid foundation with NextAuth.js, RBAC, and Prisma ORM. However, several critical security gaps exist: OAuth CSRF protection not explicitly configured, JWT tokens lack refresh rotation (30-day window), session validation missing shop membership checks, no rate limiting, no CORS/CSP headers, Facebook tokens stored unencrypted, and no input validation framework.

### Findings (by severity)

**CRITICAL:**
1. OAuth CSRF protection not explicitly documented/tested
2. JWT 30-day tokens without refresh rotation — compromised tokens can't be revoked
3. Session validation missing shop membership check — privilege escalation risk
4. Database connection security not documented (SSL/TLS requirement)
5. No input validation framework (Zod middleware) specified
6. No environment variable validation at startup (Zod schema)

**HIGH:**
7. No rate limiting on auth endpoints or API routes
8. No CORS configuration
9. Missing security headers (CSP, HSTS, X-Frame-Options)
10. 2FA deferred without compensating controls (account lockout, login alerts)
11. No session hijacking protection (user agent, IP tracking)
12. Facebook tokens stored unencrypted in database

### Missing Controls
- Input validation & sanitization framework
- Rate limiting middleware
- CORS & CSP policies
- Security headers
- Database SSL/TLS + least privilege
- Session audit logging
- Error sanitization (no stack traces leaked)
- PDPA compliance controls
- Secrets rotation documentation

### Risk Assessment: HIGH

---

## Architecture Review

### Summary
Phase 1 foundation is architecturally sound with excellent folder structure, comprehensive database schema, and proper RBAC. However, 5 significant concerns will impact Phases 4-8 if not addressed: Socket.IO not scaffolded, no multi-tenancy isolation at row level, Bull queue not set up, no API response envelope pattern, and error handling underspecified.

### Strengths
- Excellent extensible folder structure (many small files)
- Comprehensive normalized database schema (12 models, proper indexes)
- RBAC deny-by-default design (36 test assertions)
- Solid NextAuth.js v5 foundation (immutable patterns)
- Current stack (Next.js 16, React 19, TypeScript 5)
- Responsive layout with dark mode + i18n
- Complete CI/CD pipeline

### Concerns (by severity)

**HIGH:**
1. Socket.IO real-time architecture not scaffolded — Phases 5, 6, 8 blocked
2. No PostgreSQL Row-Level Security for multi-tenancy — data isolation risk
3. Bull/Redis queue system not initialized — Phase 4 order processing blocked

**MEDIUM:**
4. No API response envelope pattern — 100+ endpoints will be inconsistent
5. Error handling strategy underspecified — ad-hoc patterns will emerge
6. No folder extension contract (ARCHITECTURE.md) for Phase 2+ developers
7. LiveSession denormalization pattern undocumented

### Future-Proofing Assessment
- Phases 2-3: LOW risk (can proceed immediately)
- Phases 4-6, 8: HIGH risk if Socket.IO, Queue, and error handling not addressed
- Estimated rework if not fixed: 2-3 weeks downstream
- Estimated effort to fix now: 8-10 hours

### Risk Assessment: MEDIUM (drops to LOW if Concerns 1-5 fixed)

---

## Consensus Summary

### Agreed Strengths (both reviewers)
- Database schema is comprehensive and well-designed
- RBAC deny-by-default is correct approach
- NextAuth.js + Facebook OAuth foundation is solid
- Immutable patterns enforced throughout
- Folder structure is extensible
- CI/CD pipeline is complete

### Agreed Concerns (highest priority)

| # | Concern | Security | Architect | Priority |
|---|---------|----------|-----------|----------|
| 1 | **Environment validation missing** | CRITICAL | MEDIUM | **P0** |
| 2 | **No multi-tenancy/shop isolation** | CRITICAL (session) | HIGH (RLS) | **P0** |
| 3 | **No input validation framework** | CRITICAL | MEDIUM | **P0** |
| 4 | **Socket.IO not scaffolded** | — | HIGH | **P1** |
| 5 | **Bull queue not initialized** | — | HIGH | **P1** |
| 6 | **No API response envelope** | — | MEDIUM | **P1** |
| 7 | **No error handling strategy** | HIGH (leak risk) | MEDIUM | **P1** |
| 8 | **No rate limiting** | HIGH | — | **P1** |
| 9 | **No security headers** | HIGH | — | **P1** |
| 10 | **Facebook tokens unencrypted** | HIGH | — | **P2** |
| 11 | **JWT refresh rotation missing** | CRITICAL | — | **P2** |
| 12 | **No CORS configuration** | HIGH | — | **P2** |

### Divergent Views
- **Security** focused on token management, PDPA compliance, encryption at rest
- **Architect** focused on real-time infrastructure, queue system, API consistency
- Both agree Phase 1 is ~90% complete but missing critical infrastructure

### Recommended Additions to Phase 1

**New tasks to add (8-10 hours total):**

1. **PLAN-01 additions:**
   - Environment validation with Zod (`src/lib/env.ts`)
   - API response envelope pattern (`src/lib/api/response.ts`)
   - Structured error handling & logging (`src/lib/errors/`, `src/lib/logging/`)
   - Security headers in `next.config.ts`
   - ARCHITECTURE.md for folder conventions

2. **PLAN-02 additions:**
   - PostgreSQL RLS policies + multi-tenancy middleware
   - Bull queue initialization (order, message, inventory queues)
   - Facebook token encryption at rest

3. **PLAN-01 new task:**
   - Socket.IO server setup (singleton, room pattern, basic tests)

4. **PLAN-03 additions:**
   - Rate limiting middleware on auth endpoints
   - CORS configuration
   - Session audit logging (LoginEvent model)
