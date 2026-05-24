import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression tests for security headers declared in `next.config.ts`.
 *
 * Reads `next.config.ts` as plain text and asserts every expected
 * header + directive is present. This catches accidental softening
 * (e.g. someone broadens CSP or drops HSTS) before merge.
 *
 * The production smoke (`tests/e2e/prod-unauth-smoke.spec.ts` test
 * 17) verifies the header reaches the browser; this file pins the
 * CONFIG VALUES at the source so a config change cannot silently
 * weaken the contract.
 *
 * NEVER soften these tests. If a Boss-approved change adds a new
 * CSP source, update the test deliberately with cite to the PR
 * authorizing the change.
 */

const nextConfigPath = join(__dirname, '..', '..', '..', 'next.config.ts');
const nextConfigSource = readFileSync(nextConfigPath, 'utf8');

describe('next.config.ts — base security headers present', () => {
  it('declares X-DNS-Prefetch-Control: on', () => {
    expect(nextConfigSource).toContain("key: 'X-DNS-Prefetch-Control'");
    expect(nextConfigSource).toContain("value: 'on'");
  });

  it('declares Strict-Transport-Security with 2-year max-age + includeSubDomains + preload', () => {
    expect(nextConfigSource).toContain("key: 'Strict-Transport-Security'");
    expect(nextConfigSource).toMatch(
      /Strict-Transport-Security[\s\S]*?max-age=63072000; includeSubDomains; preload/
    );
  });

  it('declares X-Frame-Options: SAMEORIGIN (no DENY softening, no missing)', () => {
    expect(nextConfigSource).toContain("key: 'X-Frame-Options'");
    expect(nextConfigSource).toContain("value: 'SAMEORIGIN'");
  });

  it('declares X-Content-Type-Options: nosniff', () => {
    expect(nextConfigSource).toContain("key: 'X-Content-Type-Options'");
    expect(nextConfigSource).toContain("value: 'nosniff'");
  });

  it('declares Referrer-Policy: origin-when-cross-origin', () => {
    expect(nextConfigSource).toContain("key: 'Referrer-Policy'");
    expect(nextConfigSource).toContain("value: 'origin-when-cross-origin'");
  });

  it('declares Permissions-Policy disabling camera / microphone / geolocation', () => {
    expect(nextConfigSource).toContain("key: 'Permissions-Policy'");
    expect(nextConfigSource).toMatch(
      /Permissions-Policy[\s\S]*?camera=\(\), microphone=\(\), geolocation=\(\)/
    );
  });

  it('declares Content-Security-Policy header', () => {
    expect(nextConfigSource).toContain("key: 'Content-Security-Policy'");
  });
});

describe('next.config.ts — CSP directives present', () => {
  it("default-src 'self'", () => {
    expect(nextConfigSource).toContain(`"default-src 'self'"`);
  });

  it('script-src allows connect.facebook.net (FB SDK)', () => {
    expect(nextConfigSource).toContain('https://connect.facebook.net');
  });

  it("style-src 'self' + 'unsafe-inline' (Tailwind requires inline)", () => {
    expect(nextConfigSource).toContain(`"style-src 'self' 'unsafe-inline'"`);
  });

  it('img-src allows images.nazhahatyai.com (R2 CDN)', () => {
    expect(nextConfigSource).toContain('https://images.nazhahatyai.com');
  });

  it('img-src allows graph.facebook.com + *.fbcdn.net (FB profile pics)', () => {
    expect(nextConfigSource).toContain('https://graph.facebook.com');
    expect(nextConfigSource).toContain('https://*.fbcdn.net');
  });

  it("font-src 'self' https://fonts.gstatic.com", () => {
    expect(nextConfigSource).toContain(`"font-src 'self' https://fonts.gstatic.com"`);
  });

  it("connect-src 'self' + ws: + wss: + graph.facebook.com + www.facebook.com", () => {
    expect(nextConfigSource).toContain(`"connect-src 'self' ws: wss: https://graph.facebook.com https://www.facebook.com"`);
  });

  it("frame-ancestors 'none' (clickjacking defense)", () => {
    expect(nextConfigSource).toContain(`"frame-ancestors 'none'"`);
  });
});

describe('next.config.ts — CSP directives NOT broader than expected', () => {
  it("does NOT include 'unsafe-eval' in style-src", () => {
    // style-src has 'unsafe-inline' (intentional, Tailwind) but
    // unsafe-eval would be a regression
    expect(nextConfigSource).not.toMatch(
      /"style-src[^"]*'unsafe-eval'/
    );
  });

  it("does NOT include wildcard * in img-src", () => {
    // img-src allows specific hosts; wildcard would defeat the
    // CDN-only constraint
    expect(nextConfigSource).not.toMatch(
      /"img-src[^"]* \*[^"]*"/
    );
  });

  it("does NOT include 'data:' in script-src (xss vector)", () => {
    expect(nextConfigSource).not.toMatch(
      /"script-src[^"]*data:/
    );
  });

  it("does NOT include wildcard * in connect-src", () => {
    expect(nextConfigSource).not.toMatch(
      /"connect-src[^"]* \*[^"]*"/
    );
  });

  it("frame-ancestors is 'none' (NOT 'self' or '*')", () => {
    expect(nextConfigSource).not.toContain(`"frame-ancestors 'self'"`);
    expect(nextConfigSource).not.toContain(`"frame-ancestors *"`);
  });
});

describe('next.config.ts — header source matcher', () => {
  it('headers apply to all paths via source matcher (.*)', () => {
    expect(nextConfigSource).toContain("source: '/(.*)'");
  });
});

describe('next.config.ts — images remotePatterns', () => {
  it('allows graph.facebook.com for FB profile pics', () => {
    expect(nextConfigSource).toMatch(
      /remotePatterns[\s\S]*?hostname: 'graph\.facebook\.com'/
    );
  });

  it('allows *.fbcdn.net for FB image CDN', () => {
    expect(nextConfigSource).toMatch(
      /remotePatterns[\s\S]*?hostname: '\*\.fbcdn\.net'/
    );
  });
});
