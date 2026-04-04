'use client';

import { useTranslations } from 'next-intl';
import { OrderForm } from '@/components/orders/OrderForm';

export default function NewOrderPage() {
  const t = useTranslations('orders');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('newOrder')}</h1>
      <OrderForm />
    </div>
  );
}
