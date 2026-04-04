'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Webhook,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
  ToggleLeft,
  ToggleRight,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { WEBHOOK_EVENTS } from '@/lib/validation/webhook.schemas';
import type { PaginationMeta } from '@/lib/api/response';

interface WebhookData {
  readonly id: string;
  readonly url: string;
  readonly secret: string;
  readonly events: readonly string[];
  readonly isActive: boolean;
  readonly createdAt: string;
}

interface WebhookLogData {
  readonly id: string;
  readonly event: string;
  readonly statusCode: number | null;
  readonly success: boolean;
  readonly attempts: number;
  readonly error: string | null;
  readonly createdAt: string;
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<readonly WebhookData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Log viewer
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [logs, setLogs] = useState<readonly WebhookLogData[]>([]);
  const [logMeta, setLogMeta] = useState<PaginationMeta | undefined>();
  const [logPage, setLogPage] = useState(1);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/webhooks');
      const body = await res.json();
      if (body.success) {
        setWebhooks(body.data ?? []);
      }
    } catch {
      toast.error('Failed to load webhooks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  async function handleCreate() {
    if (!newUrl || newEvents.length === 0) {
      toast.error('URL and at least one event are required');
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl, events: newEvents }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success('Webhook created');
        setNewUrl('');
        setNewEvents([]);
        setShowCreate(false);
        fetchWebhooks();
      } else {
        toast.error(body.error ?? 'Failed to create');
      }
    } catch {
      toast.error('Failed to create webhook');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });
      const body = await res.json();
      if (body.success) {
        setWebhooks((prev) =>
          prev.map((w) => (w.id === id ? { ...w, isActive: !isActive } : w))
        );
        toast.success(isActive ? 'Webhook disabled' : 'Webhook enabled');
      }
    } catch {
      toast.error('Failed to toggle webhook');
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (body.success) {
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
        if (selectedWebhookId === id) {
          setSelectedWebhookId(null);
          setLogs([]);
        }
        toast.success('Webhook deleted');
      }
    } catch {
      toast.error('Failed to delete webhook');
    }
  }

  async function handleViewLogs(webhookId: string) {
    setSelectedWebhookId(webhookId);
    setLogPage(1);
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/webhooks/${webhookId}/logs?page=1&limit=20`);
      const body = await res.json();
      if (body.success) {
        setLogs(body.data ?? []);
        setLogMeta(body.meta);
      }
    } catch {
      toast.error('Failed to load logs');
    } finally {
      setIsLoadingLogs(false);
    }
  }

  function toggleEvent(event: string) {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  function copySecret(secret: string) {
    navigator.clipboard.writeText(secret);
    toast.success('Secret copied to clipboard');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground">
            Send real-time event notifications to external systems
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Webhook
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold">New Webhook</h3>
          <div className="space-y-2">
            <label className="text-sm font-medium">Endpoint URL</label>
            <Input
              placeholder="https://example.com/webhook"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Events</label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => toggleEvent(event)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    newEvents.includes(event)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {event}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Webhook'}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Webhook List */}
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : webhooks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border p-8 text-center">
          <Webhook className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No webhooks configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${wh.isActive ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    <code className="text-sm font-mono truncate">{wh.url}</code>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {wh.events.map((event) => (
                      <span
                        key={event}
                        className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Secret: {wh.secret.slice(0, 8)}...</span>
                    <button
                      onClick={() => copySecret(wh.secret)}
                      className="text-primary hover:underline"
                    >
                      <Copy className="inline h-3 w-3" /> Copy
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleViewLogs(wh.id)}
                    title="View logs"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleToggle(wh.id, wh.isActive)}
                    title={wh.isActive ? 'Disable' : 'Enable'}
                  >
                    {wh.isActive ? (
                      <ToggleRight className="h-4 w-4 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(wh.id)}
                    title="Delete"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delivery Logs */}
      {selectedWebhookId && (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Delivery Logs</h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedWebhookId(null)}>
              Close
            </Button>
          </div>
          {isLoadingLogs ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No delivery logs</div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  {log.success ? (
                    <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="font-mono text-xs">{log.event}</span>
                  <span className="text-muted-foreground">
                    {log.statusCode ? `HTTP ${log.statusCode}` : log.error ?? 'Failed'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {log.attempts > 1 ? `${log.attempts} attempts` : ''}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
          {logMeta && logMeta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={logPage <= 1}
                onClick={() => {
                  const prev = logPage - 1;
                  setLogPage(prev);
                  handleViewLogs(selectedWebhookId);
                }}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {logPage} / {logMeta.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={logPage >= logMeta.totalPages}
                onClick={() => {
                  const next = logPage + 1;
                  setLogPage(next);
                  handleViewLogs(selectedWebhookId);
                }}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
