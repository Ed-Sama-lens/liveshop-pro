'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Play, Square, Link as LinkIcon, Users, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface LiveComment {
  readonly id: string;
  readonly message: string;
  readonly from: {
    readonly id: string;
    readonly name: string;
  };
  readonly created_time: string;
}

interface LiveCommentsFeedProps {
  readonly sessionId: string;
  readonly sessionStatus: string;
}

const POLL_INTERVAL = 3000; // 3 seconds

export function LiveCommentsFeed({ sessionId, sessionStatus }: LiveCommentsFeedProps) {
  const t = useTranslations('liveComments');

  const [videoUrl, setVideoUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [comments, setComments] = useState<readonly LiveComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const fetchComments = useCallback(async () => {
    if (!videoUrl || isPaused) return;

    try {
      const params = new URLSearchParams({ videoUrl });
      if (cursor) params.set('after', cursor);

      const res = await fetch(`/api/live/${sessionId}/comments?${params.toString()}`);
      const body = await res.json();

      if (body.success && body.data) {
        const newComments = (body.data.comments as LiveComment[]).filter(
          (c) => !seenIds.current.has(c.id)
        );

        if (newComments.length > 0) {
          for (const c of newComments) {
            seenIds.current.add(c.id);
          }
          setComments((prev) => [...prev, ...newComments]);
          setCommentCount((prev) => prev + newComments.length);
        }

        if (body.data.nextCursor) {
          setCursor(body.data.nextCursor);
        }
        setError(null);
      } else {
        setError(body.error ?? t('fetchFailed'));
      }
    } catch {
      setError(t('fetchFailed'));
    }
  }, [videoUrl, cursor, isPaused, sessionId, t]);

  // Auto-scroll to bottom when new comments arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [comments]);

  // Start/stop polling
  useEffect(() => {
    if (isConnected && !isPaused) {
      fetchComments();
      intervalRef.current = setInterval(fetchComments, POLL_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isConnected, isPaused, fetchComments]);

  function handleConnect() {
    if (!videoUrl.trim()) {
      toast.error(t('enterVideoUrl'));
      return;
    }
    seenIds.current.clear();
    setComments([]);
    setCursor(null);
    setCommentCount(0);
    setError(null);
    setIsConnected(true);
    setIsPaused(false);
    toast.success(t('connected'));
  }

  function handleDisconnect() {
    setIsConnected(false);
    setIsPaused(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    toast.info(t('disconnected'));
  }

  function handleTogglePause() {
    setIsPaused((prev) => !prev);
  }

  // Detect potential order keywords (e.g. "สั่ง", "order", product codes)
  function isOrderComment(message: string): boolean {
    const orderKeywords = ['สั่ง', 'order', 'ซื้อ', 'buy', 'เอา', 'want', 'cf', 'CF'];
    const lower = message.toLowerCase();
    return orderKeywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MessageCircle className="size-5" />
            {t('title')}
          </span>
          {isConnected && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                <Users className="size-3 mr-1" />
                {commentCount} {t('comments')}
              </Badge>
              {isPaused ? (
                <Badge variant="secondary">{t('paused')}</Badge>
              ) : (
                <Badge className="bg-green-500 animate-pulse">{t('live')}</Badge>
              )}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Video URL Input */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="videoUrl" className="text-sm">{t('videoUrl')}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="videoUrl"
                  placeholder={t('videoUrlPlaceholder')}
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isConnected) handleConnect(); }}
                  disabled={isConnected}
                  className="pl-10"
                />
              </div>
              {!isConnected ? (
                <Button onClick={handleConnect} className="bg-green-600 hover:bg-green-700">
                  <Play className="size-4 mr-1" />
                  {t('connect')}
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    onClick={handleTogglePause}
                  >
                    {isPaused ? <Play className="size-4" /> : <RefreshCw className="size-4" />}
                  </Button>
                  <Button variant="destructive" onClick={handleDisconnect}>
                    <Square className="size-4 mr-1" />
                    {t('disconnect')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {error}
          </div>
        )}

        {/* Comments Feed */}
        {isConnected && (
          <div
            ref={feedRef}
            className="h-96 overflow-y-auto space-y-1 border rounded-lg p-3 bg-muted/30"
          >
            {comments.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>{t('waitingForComments')}</p>
              </div>
            ) : (
              comments.map((comment) => {
                const isOrder = isOrderComment(comment.message);
                return (
                  <div
                    key={comment.id}
                    className={`flex gap-2 p-2 rounded text-sm ${
                      isOrder
                        ? 'bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <span className="font-bold text-primary shrink-0">
                      {comment.from.name}
                    </span>
                    <span className="flex-1 break-words">{comment.message}</span>
                    {isOrder && (
                      <Badge className="shrink-0 bg-yellow-500 text-xs">{t('orderDetected')}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(comment.created_time).toLocaleTimeString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
