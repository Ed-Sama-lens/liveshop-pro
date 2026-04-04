'use client';

import { useTranslations } from 'next-intl';
import { LiveSessionForm } from '@/components/live/LiveSessionForm';

export default function NewLiveSessionPage() {
  const t = useTranslations('live');

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('newSession')}</h1>
      <LiveSessionForm />
    </div>
  );
}
