import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { signPayload } from '@/server/repositories/webhook.repository';

describe('signPayload', () => {
  it('produces a valid HMAC-SHA256 hex digest', () => {
    const payload = '{"event":"order.created","data":{}}';
    const secret = 'whsec_test_secret_123';

    const result = signPayload(payload, secret);

    // Verify against direct crypto call
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    expect(result).toBe(expected);
  });

  it('returns 64-char hex string', () => {
    const result = signPayload('test', 'secret');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different signatures for different payloads', () => {
    const secret = 'shared_secret';
    const sig1 = signPayload('payload_a', secret);
    const sig2 = signPayload('payload_b', secret);
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different secrets', () => {
    const payload = '{"test":true}';
    const sig1 = signPayload(payload, 'secret_1');
    const sig2 = signPayload(payload, 'secret_2');
    expect(sig1).not.toBe(sig2);
  });

  it('is deterministic for same input', () => {
    const payload = '{"orderId":"ord_123"}';
    const secret = 'whsec_abc';
    const sig1 = signPayload(payload, secret);
    const sig2 = signPayload(payload, secret);
    expect(sig1).toBe(sig2);
  });

  it('handles empty payload', () => {
    const result = signPayload('', 'secret');
    expect(result).toHaveLength(64);
  });

  it('handles unicode payload', () => {
    const result = signPayload('{"name":"ร้านค้า","note":"请写Facebook名"}', 'secret');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});
