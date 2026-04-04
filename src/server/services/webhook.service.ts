import {
  webhookRepository,
  signPayload,
} from '@/server/repositories/webhook.repository';
import type { Prisma } from '@/generated/prisma';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // ms

/**
 * Dispatch a webhook event to all active subscribers.
 * Fire-and-forget — errors are logged, never thrown to callers.
 */
export async function dispatchWebhook(
  shopId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const webhooks = await webhookRepository.findActiveByEvent(shopId, event);

    for (const webhook of webhooks) {
      // Don't await — send in parallel, non-blocking
      deliverWithRetry(webhook.id, webhook.url, webhook.secret, event, payload).catch(
        () => {}
      );
    }
  } catch {
    // Discovery failure — log and move on
  }
}

async function deliverWithRetry(
  webhookId: string,
  url: string,
  secret: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });
  const signature = signPayload(body, secret);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Id': webhookId,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseText = await response.text().catch(() => '');
      const success = response.status >= 200 && response.status < 300;

      await webhookRepository.createLog({
        webhookId,
        event,
        payload: payload as Prisma.InputJsonValue,
        statusCode: response.status,
        response: responseText.slice(0, 1000),
        success,
        attempts: attempt,
        error: success ? null : `HTTP ${response.status}`,
      });

      if (success) return;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      if (attempt === MAX_RETRIES) {
        await webhookRepository.createLog({
          webhookId,
          event,
          payload: payload as Prisma.InputJsonValue,
          statusCode: null,
          response: null,
          success: false,
          attempts: attempt,
          error: errorMsg,
        }).catch(() => {});
        return;
      }
    }

    // Wait before retry
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }
  }
}
