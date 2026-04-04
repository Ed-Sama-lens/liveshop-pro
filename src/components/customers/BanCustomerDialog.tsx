'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface BanCustomerDialogProps {
  readonly customerId: string;
  readonly isBanned: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function BanCustomerDialog({
  customerId,
  isBanned,
  open,
  onOpenChange,
  onSuccess,
}: BanCustomerDialogProps) {
  const t = useTranslations('customers');
  const tc = useTranslations('common');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const url = isBanned
        ? `/api/customers/${customerId}/unban`
        : `/api/customers/${customerId}/ban`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isBanned ? {} : { reason: reason || undefined }),
      });

      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error ?? 'Action failed');
        return;
      }

      toast.success(isBanned ? t('unbanSuccess') : t('banSuccess'));
      onOpenChange(false);
      setReason('');
      onSuccess();
    } catch {
      toast.error('Action failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isBanned ? t('unban') : t('ban')}</DialogTitle>
          <DialogDescription>
            {isBanned ? t('confirmUnban') : t('confirmBan')}
          </DialogDescription>
        </DialogHeader>
        {!isBanned && (
          <div className="space-y-1">
            <Label htmlFor="ban-reason">{t('bannedReason')}</Label>
            <Textarea
              id="ban-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            variant={isBanned ? 'default' : 'destructive'}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {tc('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
