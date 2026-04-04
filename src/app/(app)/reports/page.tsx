'use client';

import { useState, useCallback, useEffect } from 'react';
import { Download, FileText, Package, DollarSign, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface RevenueRow {
  readonly period: string;
  readonly orders: number;
  readonly revenue: string;
  readonly shipping: string;
  readonly netRevenue: string;
  readonly topChannel: string;
}

interface RevenueSummary {
  readonly totalRevenue: string;
  readonly totalShipping: string;
  readonly netRevenue: string;
  readonly totalOrders: number;
  readonly periods: number;
}

export default function ReportsPage() {
  // Date range
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');

  // Revenue report data
  const [revenueRows, setRevenueRows] = useState<readonly RevenueRow[]>([]);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Export state
  const [orderStatus, setOrderStatus] = useState<string>('');

  const fetchRevenue = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('from', fromDate);
      params.set('to', toDate);
      params.set('groupBy', groupBy);

      const res = await fetch(`/api/export/revenue?${params.toString()}`);
      const body = await res.json();
      if (body.success) {
        setRevenueRows(body.data.rows);
        setSummary(body.data.summary);
      }
    } catch {
      toast.error('Failed to load revenue data');
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate, groupBy]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  function downloadFile(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleExportOrders() {
    const params = new URLSearchParams();
    if (orderStatus) params.set('status', orderStatus);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    downloadFile(`/api/export/orders?${params.toString()}`);
    toast.success('Downloading orders CSV...');
  }

  function handleExportInventory() {
    downloadFile('/api/export/inventory');
    toast.success('Downloading inventory CSV...');
  }

  function handleExportRevenue() {
    const params = new URLSearchParams();
    params.set('from', fromDate);
    params.set('to', toDate);
    params.set('groupBy', groupBy);
    params.set('format', 'csv');
    downloadFile(`/api/export/revenue?${params.toString()}`);
    toast.success('Downloading revenue CSV...');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports & Export</h1>
        <p className="text-sm text-muted-foreground">Generate reports and export data</p>
      </div>

      {/* Quick Export Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Orders Export */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold">Export Orders</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Download all orders as CSV with customer and payment details.
          </p>
          <div className="space-y-2">
            <Select value={orderStatus} onValueChange={(v) => setOrderStatus(v ?? '')}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="RESERVED">Reserved</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="PACKED">Packed</SelectItem>
                <SelectItem value="SHIPPED">Shipped</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="w-full" onClick={handleExportOrders}>
              <Download className="mr-1 h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>

        {/* Inventory Export */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold">Export Inventory</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Download all products and variants with stock levels.
          </p>
          <Button size="sm" className="w-full" onClick={handleExportInventory}>
            <Download className="mr-1 h-4 w-4" />
            Download CSV
          </Button>
        </div>

        {/* Revenue Export */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-500" />
            <h3 className="font-semibold">Export Revenue</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Download revenue breakdown by period as CSV.
          </p>
          <Button size="sm" className="w-full" onClick={handleExportRevenue}>
            <Download className="mr-1 h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </div>

      {/* Revenue Report */}
      <div className="rounded-lg border">
        <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Revenue Report</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <Select value={groupBy} onValueChange={(v) => setGroupBy((v as 'day' | 'month') ?? 'day')}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">By Day</SelectItem>
                <SelectItem value="month">By Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 gap-4 border-b p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-lg font-bold">฿{Number(summary.totalRevenue).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net Revenue</p>
              <p className="text-lg font-bold text-green-600">
                ฿{Number(summary.netRevenue).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="text-lg font-bold">{summary.totalOrders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Shipping Fees</p>
              <p className="text-lg font-bold text-muted-foreground">
                ฿{Number(summary.totalShipping).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Revenue Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Period</th>
                <th className="px-4 py-2 text-right font-medium">Orders</th>
                <th className="px-4 py-2 text-right font-medium">Revenue</th>
                <th className="px-4 py-2 text-right font-medium">Shipping</th>
                <th className="px-4 py-2 text-right font-medium">Net Revenue</th>
                <th className="px-4 py-2 text-left font-medium">Top Channel</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : revenueRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No data for the selected period
                  </td>
                </tr>
              ) : (
                revenueRows.map((row) => (
                  <tr key={row.period} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{row.period}</td>
                    <td className="px-4 py-2 text-right">{row.orders}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      ฿{Number(row.revenue).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                      ฿{Number(row.shipping).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-green-600">
                      ฿{Number(row.netRevenue).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-xs">{row.topChannel}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
