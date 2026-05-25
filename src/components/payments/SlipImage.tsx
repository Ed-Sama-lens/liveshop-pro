'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, AlertTriangle } from 'lucide-react';

/**
 * SlipImage — admin-only viewer that fetches a short-lived signed
 * R2 GET URL via `/api/payments/[id]/slip-url` instead of rendering
 * the raw public CDN URL. Closes the R2 G3 PII leak risk fully
 * (per audit doc `docs/superpowers/2026-05-24-r2-storage-paths-audit.md`).
 *
 * Behavior:
 *   - Renders empty-state icon when `paymentId` not given OR signed
 *     URL fetch returns 404 ("No slip uploaded").
 *   - Renders error icon + tooltip when fetch fails (403/500/network).
 *   - Renders `<img>` once signed URL resolves.
 *
 * Auth: route is OWNER|MANAGER + same-shop only; cross-shop returns
 * 403 → component shows error state.
 *
 * Refresh: signed URL expires in ~10 minutes by default. If user
 * keeps the dialog open longer, the image link may stop working;
 * re-opening the dialog triggers a fresh fetch.
 *
 * NEVER renders the raw `payment.slipUrl` value directly. The whole
 * point is to keep the public CDN URL off the admin DOM.
 */
export interface SlipImageProps {
  /** Payment ID — required for the signed-URL fetch. */
  readonly paymentId: string;
  /** Whether this payment has a slip uploaded. If false, renders empty-state. */
  readonly hasSlip: boolean;
  readonly alt?: string;
  readonly className?: string;
  /** Render variant. `thumbnail` is small + square; `detail` is large. */
  readonly variant?: 'thumbnail' | 'detail';
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'empty' } // 404 no slip
  | { kind: 'error'; message: string };

export function SlipImage({
  paymentId,
  hasSlip,
  alt = 'Payment slip',
  className,
  variant = 'thumbnail',
}: SlipImageProps) {
  // Derive initial state synchronously from props to avoid cascading
  // setState inside useEffect. hasSlip=false short-circuits the
  // network call entirely; hasSlip=true enters loading until the
  // signed-URL fetch resolves.
  const [state, setState] = useState<FetchState>(
    hasSlip ? { kind: 'loading' } : { kind: 'empty' }
  );

  useEffect(() => {
    if (!hasSlip) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/payments/${encodeURIComponent(paymentId)}/slip-url`, {
          method: 'GET',
          credentials: 'same-origin',
        });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'empty' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const body = (await res.json()) as {
          success?: boolean;
          data?: { url?: string; expiresAt?: string };
          error?: string;
        };
        if (!body.success || !body.data?.url) {
          setState({ kind: 'error', message: body.error ?? 'Invalid response' });
          return;
        }
        setState({ kind: 'ready', url: body.data.url });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Network error',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentId, hasSlip]);

  // Empty state — no slip uploaded
  if (state.kind === 'empty') {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ''}`}
        data-testid="slip-image-empty"
      >
        <ImageIcon className={variant === 'detail' ? 'h-12 w-12 opacity-50' : 'h-6 w-6'} />
      </div>
    );
  }

  // Error state — fetch failed
  if (state.kind === 'error') {
    return (
      <div
        className={`flex items-center justify-center bg-destructive/10 text-destructive ${className ?? ''}`}
        title={state.message}
        data-testid="slip-image-error"
      >
        <AlertTriangle className={variant === 'detail' ? 'h-12 w-12' : 'h-6 w-6'} />
      </div>
    );
  }

  // Loading state — placeholder while signed URL fetches
  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <div
        className={`flex items-center justify-center bg-muted/50 animate-pulse ${className ?? ''}`}
        data-testid="slip-image-loading"
      >
        <ImageIcon className={variant === 'detail' ? 'h-12 w-12 opacity-30' : 'h-6 w-6 opacity-30'} />
      </div>
    );
  }

  // Ready — render the signed URL
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={state.url}
      alt={alt}
      className={className}
      data-testid="slip-image-ready"
    />
  );
}
