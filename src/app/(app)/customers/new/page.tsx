'use client';

import { useTranslations } from 'next-intl';
import { CustomerForm } from '@/components/customers/CustomerForm';

export default function NewCustomerPage() {
  const t = useTranslations('customers');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('newCustomer')}</h1>
      <CustomerForm mode="create" />
    </div>
  );
}
