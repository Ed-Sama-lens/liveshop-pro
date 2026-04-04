'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

const CHANNELS = ['FACEBOOK', 'INSTAGRAM', 'LINE', 'TIKTOK', 'MANUAL', 'STOREFRONT'] as const;
const SHIPPING_TYPES = ['STANDARD', 'EXPRESS', 'PICKUP', 'COD'] as const;

interface CustomerFormProps {
  readonly mode: 'create' | 'edit';
  readonly initialData?: {
    readonly id: string;
    readonly name: string;
    readonly phone: string | null;
    readonly email: string | null;
    readonly facebookId: string | null;
    readonly address: string | null;
    readonly district: string | null;
    readonly province: string | null;
    readonly postalCode: string | null;
    readonly labels: string[];
    readonly shippingType: string | null;
    readonly notes: string | null;
    readonly channel: string;
  };
}

export function CustomerForm({ mode, initialData }: CustomerFormProps) {
  const t = useTranslations('customers');
  const tc = useTranslations('common');
  const router = useRouter();

  const [name, setName] = useState(initialData?.name ?? '');
  const [phone, setPhone] = useState(initialData?.phone ?? '');
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [facebookId, setFacebookId] = useState(initialData?.facebookId ?? '');
  const [address, setAddress] = useState(initialData?.address ?? '');
  const [district, setDistrict] = useState(initialData?.district ?? '');
  const [province, setProvince] = useState(initialData?.province ?? '');
  const [postalCode, setPostalCode] = useState(initialData?.postalCode ?? '');
  const [channel, setChannel] = useState(initialData?.channel ?? 'MANUAL');
  const [shippingType, setShippingType] = useState(initialData?.shippingType ?? '');
  const [labels, setLabels] = useState<string[]>(initialData?.labels ?? []);
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [newLabel, setNewLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function addLabel() {
    const trimmed = newLabel.trim();
    if (!trimmed || labels.includes(trimmed)) return;
    setLabels((prev) => [...prev, trimmed]);
    setNewLabel('');
  }

  function removeLabel(label: string) {
    setLabels((prev) => prev.filter((l) => l !== label));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload = {
        name,
        phone: phone || undefined,
        email: email || undefined,
        facebookId: facebookId || undefined,
        address: address || undefined,
        district: district || undefined,
        province: province || undefined,
        postalCode: postalCode || undefined,
        channel,
        shippingType: shippingType || undefined,
        labels,
        notes: notes || undefined,
      };

      const url = mode === 'create' ? '/api/customers' : `/api/customers/${initialData!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error ?? 'Save failed');
        return;
      }

      toast.success(mode === 'create' ? t('created') : t('updated'));
      router.push('/customers');
      router.refresh();
    } catch {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="name">{t('name')}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">{t('email')}</Label>
          <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="facebookId">{t('facebookId')}</Label>
          <Input id="facebookId" value={facebookId} onChange={(e) => setFacebookId(e.target.value)} />
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="address">{t('address')}</Label>
          <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="district">{t('district')}</Label>
            <Input id="district" value={district} onChange={(e) => setDistrict(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="province">{t('province')}</Label>
            <Input id="province" value={province} onChange={(e) => setProvince(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="postalCode">{t('postalCode')}</Label>
            <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t('channel')}</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v ?? 'MANUAL')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((ch) => (
                <SelectItem key={ch} value={ch}>{ch}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('shippingType')}</Label>
          <Select value={shippingType} onValueChange={(v) => setShippingType(v ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">—</SelectItem>
              {SHIPPING_TYPES.map((st) => (
                <SelectItem key={st} value={st}>{st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Labels */}
      <div className="space-y-2">
        <Label>{t('labels')}</Label>
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
                <button
                  type="button"
                  onClick={() => removeLabel(label)}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('addLabel')}
            className="w-48"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addLabel();
              }
            }}
          />
          <Button variant="outline" size="sm" type="button" onClick={addLabel}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label htmlFor="notes">{t('notes')}</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {t('save')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/customers')}>
          {tc('cancel')}
        </Button>
      </div>
    </form>
  );
}
