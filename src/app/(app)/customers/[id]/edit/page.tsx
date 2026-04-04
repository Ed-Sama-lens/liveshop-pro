'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function EditCustomerPage() {
  const t = useTranslations('customers');
  const params = useParams();
  const id = params.id as string;

  const [customer, setCustomer] = useState<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    facebookId: string | null;
    address: string | null;
    district: string | null;
    province: string | null;
    postalCode: string | null;
    labels: string[];
    shippingType: string | null;
    notes: string | null;
    channel: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomer = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}`);
      const body = await res.json();
      if (body.success && body.data) {
        setCustomer(body.data);
      }
    } catch {
      toast.error('Failed to load customer');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground">Customer not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('editCustomer')}</h1>
      <CustomerForm mode="edit" initialData={customer} />
    </div>
  );
}
