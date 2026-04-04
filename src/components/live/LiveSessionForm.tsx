'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { LiveSessionRow } from '@/server/repositories/live.repository';

interface LiveSessionFormProps {
  readonly session?: LiveSessionRow;
}

export function LiveSessionForm({ session }: LiveSessionFormProps) {
  const t = useTranslations('live');
  const tc = useTranslations('common');
  const router = useRouter();

  const [title, setTitle] = useState(session?.title ?? '');
  const [scheduledAt, setScheduledAt] = useState(
    session?.scheduledAt
      ? new Date(session.scheduledAt).toISOString().slice(0, 16)
      : ''
  );
  const [isSaving, setIsSaving] = useState(false);

  const isEdit = !!session;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const url = isEdit ? `/api/live/${session.id}` : '/api/live';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          scheduledAt: scheduledAt || undefined,
        }),
      });

      const body = await res.json();
      if (body.success) {
        toast.success(isEdit ? t('updated') : t('created'));
        router.push(isEdit ? `/live-selling/${session.id}` : '/live-selling');
      } else {
        toast.error(body.error ?? 'Save failed');
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{t('sessionTitle')}</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>{t('scheduledAt')}</Label>
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tc('cancel')}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
