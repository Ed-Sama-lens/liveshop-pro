'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  Download,
  RefreshCw,
  FileSpreadsheet,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

interface ImportResult {
  readonly created: number;
  readonly updated: number;
  readonly errors: readonly { line: number; message: string }[];
}

interface BulkStatusResult {
  readonly updated: number;
  readonly notFound: number;
  readonly errors: readonly { orderId: string; message: string }[];
  readonly total: number;
}

export default function BulkOperationsPage() {
  const t = useTranslations('bulk');

  // CSV Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk status state
  const [orderIdsText, setOrderIdsText] = useState('');
  const [bulkStatus, setBulkStatus] = useState('CONFIRMED');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkStatusResult | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();

      if (body.success) {
        setImportResult(body.data);
        toast.success(t('importSuccess', {
          created: body.data.created,
          updated: body.data.updated,
        }));
        setImportFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        toast.error(body.error ?? t('importFailed'));
      }
    } catch {
      toast.error(t('importFailed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/products/export');
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t('exportSuccess'));
    } catch {
      toast.error(t('exportFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkStatus = async () => {
    const orderIds = orderIdsText
      .split(/[\n,]+/)
      .map((id) => id.trim())
      .filter(Boolean);

    if (orderIds.length === 0) {
      toast.error(t('noOrderIds'));
      return;
    }

    setIsBulkUpdating(true);
    setBulkResult(null);

    try {
      const res = await fetch('/api/orders/bulk-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds, status: bulkStatus }),
      });
      const body = await res.json();

      if (body.success) {
        setBulkResult(body.data);
        toast.success(t('bulkStatusSuccess', { count: body.data.updated }));
        setOrderIdsText('');
      } else {
        toast.error(body.error ?? t('bulkStatusFailed'));
      }
    } catch {
      toast.error(t('bulkStatusFailed'));
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* CSV Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4" />
              {t('importProducts')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('importDesc')}</p>

            <div>
              <Label htmlFor="csv-file">{t('csvFile')}</Label>
              <Input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="mt-1"
              />
            </div>

            <Button
              onClick={handleImport}
              disabled={!importFile || isImporting}
              className="w-full"
            >
              {isImporting ? (
                <RefreshCw className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              {t('importButton')}
            </Button>

            {importResult && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle className="size-4 text-green-600" />
                  <span>{t('created')}: {importResult.created}</span>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="size-4 text-blue-600" />
                  <span>{t('updated')}: {importResult.updated}</span>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="size-4" />
                      <span>{t('importErrors', { count: importResult.errors.length })}</span>
                    </div>
                    <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      {importResult.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>Line {e.line}: {e.message}</li>
                      ))}
                      {importResult.errors.length > 5 && (
                        <li>...and {importResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CSV Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="size-4" />
              {t('exportProducts')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('exportDesc')}</p>

            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-sm mb-2">{t('csvFormat')}</h4>
              <code className="text-xs text-muted-foreground block">
                stockCode, saleCode, name, description, sku, attributes, price, costPrice, quantity, lowStockAt
              </code>
            </div>

            <Button
              onClick={handleExport}
              disabled={isExporting}
              variant="outline"
              className="w-full"
            >
              {isExporting ? (
                <RefreshCw className="mr-2 size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 size-4" />
              )}
              {t('exportButton')}
            </Button>
          </CardContent>
        </Card>

        {/* Bulk Order Status */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="size-4" />
              {t('bulkStatus')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('bulkStatusDesc')}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t('orderIds')}</Label>
                <Textarea
                  value={orderIdsText}
                  onChange={(e) => setOrderIdsText(e.target.value)}
                  placeholder={t('orderIdsPlaceholder')}
                  rows={6}
                  className="mt-1 font-mono text-sm"
                />
              </div>
              <div className="space-y-4">
                <div>
                  <Label>{t('newStatus')}</Label>
                  <Select value={bulkStatus} onValueChange={(v) => v && setBulkStatus(v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                      <SelectItem value="SHIPPED">SHIPPED</SelectItem>
                      <SelectItem value="DELIVERED">DELIVERED</SelectItem>
                      <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleBulkStatus}
                  disabled={!orderIdsText.trim() || isBulkUpdating}
                  className="w-full"
                >
                  {isBulkUpdating ? (
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 size-4" />
                  )}
                  {t('updateStatus')}
                </Button>

                {bulkResult && (
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                    <p>
                      <Badge variant="default">{bulkResult.updated}</Badge> {t('ordersUpdated')}
                    </p>
                    {bulkResult.notFound > 0 && (
                      <p className="text-amber-600">
                        {bulkResult.notFound} {t('ordersNotFound')}
                      </p>
                    )}
                    {bulkResult.errors.length > 0 && (
                      <p className="text-red-600">
                        {bulkResult.errors.length} {t('ordersFailed')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
