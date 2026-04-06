'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LiveStatusBadge } from '@/components/live/LiveStatusBadge';
import { LiveSessionForm } from '@/components/live/LiveSessionForm';
import { LiveCommentsFeed } from '@/components/live/LiveCommentsFeed';
import { Play, Square, Trash2, Pencil, Users, ShoppingCart, DollarSign, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { LiveSessionRow } from '@/server/repositories/live.repository';
import { VALID_LIVE_TRANSITIONS } from '@/lib/validation/live.schemas';

export default function LiveSessionDetailPage() {
  const t = useTranslations('live');
  const tc = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [session, setSession] = useState<LiveSessionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [transitionDialog, setTransitionDialog] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/${id}`);
      const body = await res.json();
      if (body.success && body.data) {
        setSession(body.data);
      }
    } catch {
      toast.error('Failed to load session');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Auto-refresh when live
  useEffect(() => {
    if (session?.status !== 'LIVE') return;
    const interval = setInterval(fetchSession, 10000);
    return () => clearInterval(interval);
  }, [session?.status, fetchSession]);

  async function handleTransition(newStatus: string) {
    setIsTransitioning(true);
    try {
      const res = await fetch(`/api/live/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('transitionSuccess'));
        setSession(body.data);
      } else {
        toast.error(body.error ?? 'Transition failed');
      }
    } catch {
      toast.error('Transition failed');
    } finally {
      setIsTransitioning(false);
      setTransitionDialog(null);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/live/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('deleted'));
        router.push('/live-selling');
      } else {
        const body = await res.json();
        toast.error(body.error ?? 'Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground">Session not found</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('editSession')}</h1>
        <LiveSessionForm session={session} />
      </div>
    );
  }

  const availableTransitions = VALID_LIVE_TRANSITIONS[session.status] ?? [];

  function formatDuration(): string {
    if (!session?.startedAt) return '—';
    const start = new Date(session.startedAt);
    const end = session.endedAt ? new Date(session.endedAt) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {session.title ?? 'Untitled Session'}
          </h1>
          <div className="mt-1">
            <LiveStatusBadge status={session.status} />
          </div>
        </div>
        <div className="flex gap-2">
          {session.status === 'SCHEDULED' && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="size-3.5" />
              {t('editSession')}
            </Button>
          )}
          {session.status !== 'LIVE' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Status Actions */}
      {availableTransitions.length > 0 && (
        <div className="flex gap-2">
          {availableTransitions.includes('LIVE') && (
            <Button onClick={() => setTransitionDialog('LIVE')}>
              <Play className="size-4" />
              {t('goLive')}
            </Button>
          )}
          {availableTransitions.includes('ENDED') && (
            <Button
              variant={session.status === 'LIVE' ? 'destructive' : 'outline'}
              onClick={() => setTransitionDialog('ENDED')}
            >
              <Square className="size-4" />
              {t('endSession')}
            </Button>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3 text-center">
          <Users className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-1 text-2xl font-bold">{session.viewerCount.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{t('viewerCount')}</p>
        </Card>
        <Card className="p-3 text-center">
          <ShoppingCart className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-1 text-2xl font-bold">{session.orderCount.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{t('orderCount')}</p>
        </Card>
        <Card className="p-3 text-center">
          <DollarSign className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-1 text-2xl font-bold font-mono">RM{Number(session.totalRevenue).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{t('totalRevenue')}</p>
        </Card>
        <Card className="p-3 text-center">
          <Clock className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-1 text-2xl font-bold">{formatDuration()}</p>
          <p className="text-xs text-muted-foreground">{t('duration')}</p>
        </Card>
      </div>

      {/* Details */}
      <Card className="p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {session.scheduledAt && (
            <div>
              <span className="text-muted-foreground">{t('scheduledAt')}:</span>{' '}
              {new Date(session.scheduledAt).toLocaleString()}
            </div>
          )}
          {session.startedAt && (
            <div>
              <span className="text-muted-foreground">{t('startedAt')}:</span>{' '}
              {new Date(session.startedAt).toLocaleString()}
            </div>
          )}
          {session.endedAt && (
            <div>
              <span className="text-muted-foreground">{t('endedAt')}:</span>{' '}
              {new Date(session.endedAt).toLocaleString()}
            </div>
          )}
          {session.fbLiveId && (
            <div>
              <span className="text-muted-foreground">FB Live ID:</span>{' '}
              <span className="font-mono text-xs">{session.fbLiveId}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Live Comments Feed */}
      {(session.status === 'LIVE' || session.status === 'ENDED') && (
        <LiveCommentsFeed sessionId={id} sessionStatus={session.status} />
      )}

      {/* Transition Dialog */}
      <Dialog open={transitionDialog !== null} onOpenChange={(open) => { if (!open) setTransitionDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTransition')}</DialogTitle>
            <DialogDescription>
              {session.status} → {transitionDialog}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionDialog(null)}>
              {tc('cancel')}
            </Button>
            <Button
              variant={transitionDialog === 'ENDED' ? 'destructive' : 'default'}
              onClick={() => transitionDialog && handleTransition(transitionDialog)}
              disabled={isTransitioning}
            >
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete')}</DialogTitle>
            <DialogDescription>{t('confirmDelete')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>{tc('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
