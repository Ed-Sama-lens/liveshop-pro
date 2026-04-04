'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowRightLeft,
  Calendar,
  RefreshCw,
  Save,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  CURRENCY_NAMES,
  type SupportedCurrency,
} from '@/lib/currency/constants';
import type { ExchangeRateRow } from '@/server/repositories/exchange-rate.repository';

// All unique currency pairs (no self-pairs)
const CURRENCY_PAIRS: readonly { base: SupportedCurrency; target: SupportedCurrency }[] =
  SUPPORTED_CURRENCIES.flatMap((base) =>
    SUPPORTED_CURRENCIES.filter((t) => t !== base).map((target) => ({ base, target }))
  );

interface RateFormEntry {
  readonly baseCurrency: SupportedCurrency;
  readonly targetCurrency: SupportedCurrency;
  readonly rate: string;
}

export default function ExchangeRatesPage() {
  const t = useTranslations('exchangeRates');

  const [rates, setRates] = useState<readonly ExchangeRateRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Conversion calculator state
  const [convertAmount, setConvertAmount] = useState('100');
  const [convertFrom, setConvertFrom] = useState<SupportedCurrency>('THB');
  const [convertTo, setConvertTo] = useState<SupportedCurrency>('MYR');
  const [convertResult, setConvertResult] = useState<{
    converted: number;
    rate: string;
  } | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Rate entry form — initialize from pairs
  const [rateForm, setRateForm] = useState<readonly RateFormEntry[]>(
    CURRENCY_PAIRS.map((p) => ({
      baseCurrency: p.base,
      targetCurrency: p.target,
      rate: '',
    }))
  );

  const fetchRates = useCallback(async (date?: string) => {
    setIsLoading(true);
    try {
      const qs = date ? `?date=${date}` : '';
      const res = await fetch(`/api/exchange-rates${qs}`);
      const body = await res.json();
      if (body.success) {
        const fetchedRates: readonly ExchangeRateRow[] = body.data.rates;
        setRates(fetchedRates);

        // Populate form from fetched rates
        setRateForm((prev) =>
          prev.map((entry) => {
            const match = fetchedRates.find(
              (r) =>
                r.baseCurrency === entry.baseCurrency &&
                r.targetCurrency === entry.targetCurrency
            );
            return match ? { ...entry, rate: match.rate } : { ...entry, rate: '' };
          })
        );
      }
    } catch {
      toast.error(t('fetchError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchRates(selectedDate);
  }, [fetchRates, selectedDate]);

  const handleSaveRate = async (entry: RateFormEntry) => {
    if (!entry.rate || isNaN(Number(entry.rate)) || Number(entry.rate) <= 0) {
      toast.error(t('invalidRate'));
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/exchange-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseCurrency: entry.baseCurrency,
          targetCurrency: entry.targetCurrency,
          rate: Number(entry.rate),
          date: selectedDate,
        }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('rateSaved'));
        fetchRates(selectedDate);
      } else {
        toast.error(body.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConvert = async () => {
    if (!convertAmount || isNaN(Number(convertAmount))) {
      toast.error(t('invalidAmount'));
      return;
    }
    setIsConverting(true);
    try {
      const res = await fetch(
        `/api/exchange-rates/convert?amount=${convertAmount}&from=${convertFrom}&to=${convertTo}`
      );
      const body = await res.json();
      if (body.success) {
        setConvertResult(body.data);
      } else {
        toast.error(body.error ?? t('convertFailed'));
        setConvertResult(null);
      }
    } catch {
      toast.error(t('convertFailed'));
    } finally {
      setIsConverting(false);
    }
  };

  const updateRateForm = (index: number, value: string) => {
    setRateForm((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, rate: value } : entry))
    );
  };

  // Build a rate lookup matrix
  const rateMatrix: Record<string, Record<string, string>> = {};
  for (const r of rates) {
    if (!rateMatrix[r.baseCurrency]) rateMatrix[r.baseCurrency] = {};
    rateMatrix[r.baseCurrency][r.targetCurrency] = r.rate;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchRates(selectedDate)}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </Button>
      </div>

      {/* Date Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            {t('rateDate')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-auto"
            />
            <Badge variant="secondary">
              {rates.length > 0
                ? t('ratesFound', { count: rates.length })
                : t('noRates')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Rate Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            {t('rateMatrix')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left font-medium">{t('from')} / {t('to')}</th>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <th key={c} className="p-2 text-center font-medium">
                        {CURRENCY_SYMBOLS[c]} {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SUPPORTED_CURRENCIES.map((base) => (
                    <tr key={base} className="border-b">
                      <td className="p-2 font-medium">
                        {CURRENCY_SYMBOLS[base]} {base}
                      </td>
                      {SUPPORTED_CURRENCIES.map((target) => (
                        <td key={target} className="p-2 text-center">
                          {base === target ? (
                            <span className="text-muted-foreground">1.000000</span>
                          ) : rateMatrix[base]?.[target] ? (
                            <span className="font-mono">
                              {Number(rateMatrix[base][target]).toFixed(6)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Rate Entry */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('manualEntry')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rateForm.map((entry, index) => (
              <div
                key={`${entry.baseCurrency}-${entry.targetCurrency}`}
                className="flex items-end gap-2 rounded-lg border p-3"
              >
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">
                    {CURRENCY_SYMBOLS[entry.baseCurrency]} {entry.baseCurrency}{' '}
                    → {CURRENCY_SYMBOLS[entry.targetCurrency]} {entry.targetCurrency}
                  </Label>
                  <Input
                    type="number"
                    step="0.000001"
                    min="0"
                    placeholder="0.000000"
                    value={entry.rate}
                    onChange={(e) => updateRateForm(index, e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSaveRate(entry)}
                  disabled={isSaving || !entry.rate}
                >
                  <Save className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Currency Converter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="h-4 w-4" />
            {t('converter')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs">{t('amount')}</Label>
              <Input
                type="number"
                value={convertAmount}
                onChange={(e) => setConvertAmount(e.target.value)}
                className="mt-1 w-32"
              />
            </div>
            <div>
              <Label className="text-xs">{t('from')}</Label>
              <Select
                value={convertFrom}
                onValueChange={(v) => v && setConvertFrom(v as SupportedCurrency)}
              >
                <SelectTrigger className="mt-1 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_SYMBOLS[c]} {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('to')}</Label>
              <Select
                value={convertTo}
                onValueChange={(v) => v && setConvertTo(v as SupportedCurrency)}
              >
                <SelectTrigger className="mt-1 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_SYMBOLS[c]} {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleConvert} disabled={isConverting}>
              {isConverting ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" />
              )}
              {t('convert')}
            </Button>
          </div>

          {convertResult && (
            <div className="mt-4 rounded-lg bg-muted p-4">
              <p className="text-lg font-semibold">
                {CURRENCY_SYMBOLS[convertFrom]}{Number(convertAmount).toLocaleString()}{' '}
                ={' '}
                <span className="text-primary">
                  {CURRENCY_SYMBOLS[convertTo]}{convertResult.converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {t('rateLabel')}: 1 {convertFrom} = {convertResult.rate} {convertTo}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
