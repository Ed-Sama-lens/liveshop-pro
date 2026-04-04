import { describe, it, expect } from 'vitest';
import {
  storefrontProductQuerySchema,
  publishProductSchema,
  updateStorefrontProductSchema,
  addToCartSchema,
  updateCartItemSchema,
  shopBrandingSchema,
  checkoutSchema,
} from '@/lib/validation/storefront.schemas';

describe('storefrontProductQuerySchema', () => {
  it('applies defaults when empty', () => {
    const result = storefrontProductQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('accepts valid query with all fields', () => {
    const result = storefrontProductQuerySchema.parse({
      page: '2',
      limit: '10',
      category: 'Electronics',
      search: 'phone',
    });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.category).toBe('Electronics');
    expect(result.search).toBe('phone');
  });

  it('rejects limit above 100', () => {
    const result = storefrontProductQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('rejects page below 1', () => {
    const result = storefrontProductQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });
});

describe('publishProductSchema', () => {
  it('accepts valid input', () => {
    const result = publishProductSchema.parse({
      productId: 'prod_123',
      isVisible: true,
      sortOrder: 5,
    });
    expect(result.productId).toBe('prod_123');
    expect(result.isVisible).toBe(true);
    expect(result.sortOrder).toBe(5);
  });

  it('applies defaults for isVisible and sortOrder', () => {
    const result = publishProductSchema.parse({ productId: 'prod_123' });
    expect(result.isVisible).toBe(true);
    expect(result.sortOrder).toBe(0);
  });

  it('rejects empty productId', () => {
    const result = publishProductSchema.safeParse({ productId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative sortOrder', () => {
    const result = publishProductSchema.safeParse({ productId: 'p1', sortOrder: -1 });
    expect(result.success).toBe(false);
  });
});

describe('updateStorefrontProductSchema', () => {
  it('accepts partial update with isVisible', () => {
    const result = updateStorefrontProductSchema.parse({ isVisible: false });
    expect(result.isVisible).toBe(false);
  });

  it('accepts partial update with sortOrder', () => {
    const result = updateStorefrontProductSchema.parse({ sortOrder: 10 });
    expect(result.sortOrder).toBe(10);
  });

  it('accepts empty object', () => {
    const result = updateStorefrontProductSchema.parse({});
    expect(result).toEqual({});
  });
});

describe('addToCartSchema', () => {
  it('accepts valid input', () => {
    const result = addToCartSchema.parse({
      productId: 'prod_1',
      variantId: 'var_1',
      quantity: 3,
    });
    expect(result.productId).toBe('prod_1');
    expect(result.variantId).toBe('var_1');
    expect(result.quantity).toBe(3);
  });

  it('rejects quantity of 0', () => {
    const result = addToCartSchema.safeParse({
      productId: 'p1',
      variantId: 'v1',
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects quantity above 999', () => {
    const result = addToCartSchema.safeParse({
      productId: 'p1',
      variantId: 'v1',
      quantity: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing productId', () => {
    const result = addToCartSchema.safeParse({ variantId: 'v1', quantity: 1 });
    expect(result.success).toBe(false);
  });

  it('coerces string quantity', () => {
    const result = addToCartSchema.parse({
      productId: 'p1',
      variantId: 'v1',
      quantity: '5',
    });
    expect(result.quantity).toBe(5);
  });
});

describe('updateCartItemSchema', () => {
  it('accepts quantity of 0 (remove item)', () => {
    const result = updateCartItemSchema.parse({ quantity: 0 });
    expect(result.quantity).toBe(0);
  });

  it('accepts valid quantity', () => {
    const result = updateCartItemSchema.parse({ quantity: 10 });
    expect(result.quantity).toBe(10);
  });

  it('rejects quantity above 999', () => {
    const result = updateCartItemSchema.safeParse({ quantity: 1000 });
    expect(result.success).toBe(false);
  });

  it('rejects negative quantity', () => {
    const result = updateCartItemSchema.safeParse({ quantity: -1 });
    expect(result.success).toBe(false);
  });
});

describe('shopBrandingSchema', () => {
  it('accepts valid branding', () => {
    const result = shopBrandingSchema.parse({
      logo: 'https://example.com/logo.png',
      banner: 'https://example.com/banner.jpg',
      primaryColor: '#ff5733',
      accentColor: '#33ff57',
      description: 'My awesome shop',
    });
    expect(result.primaryColor).toBe('#ff5733');
  });

  it('accepts null values', () => {
    const result = shopBrandingSchema.parse({
      logo: null,
      primaryColor: null,
    });
    expect(result.logo).toBeNull();
    expect(result.primaryColor).toBeNull();
  });

  it('accepts empty object', () => {
    const result = shopBrandingSchema.parse({});
    expect(result).toEqual({});
  });

  it('rejects invalid color format', () => {
    const result = shopBrandingSchema.safeParse({ primaryColor: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = shopBrandingSchema.safeParse({ logo: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects description over 2000 chars', () => {
    const result = shopBrandingSchema.safeParse({ description: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });
});

describe('shopBrandingSchema — payment fields', () => {
  it('accepts valid payment config', () => {
    const result = shopBrandingSchema.parse({
      promptpayQrUrl: 'https://example.com/qr.png',
      promptpayNote: 'Scan to pay with any Thai bank app',
      bankName: 'Maybank',
      bankAccount: '562021676858',
      bankAccountName: 'Nazha Hatyai Sales Marketing',
      bankNote: '请写Facebook名在Recipient Reference',
    });
    expect(result.bankName).toBe('Maybank');
    expect(result.bankAccount).toBe('562021676858');
    expect(result.promptpayQrUrl).toBe('https://example.com/qr.png');
  });

  it('accepts null payment fields', () => {
    const result = shopBrandingSchema.parse({
      promptpayQrUrl: null,
      bankName: null,
      bankAccount: null,
    });
    expect(result.promptpayQrUrl).toBeNull();
    expect(result.bankName).toBeNull();
  });

  it('rejects invalid promptpay QR URL', () => {
    const result = shopBrandingSchema.safeParse({ promptpayQrUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects bank account over 50 chars', () => {
    const result = shopBrandingSchema.safeParse({ bankAccount: 'x'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('rejects bank name over 100 chars', () => {
    const result = shopBrandingSchema.safeParse({ bankName: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects promptpay note over 2000 chars', () => {
    const result = shopBrandingSchema.safeParse({ promptpayNote: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('accepts mixed branding + payment fields', () => {
    const result = shopBrandingSchema.parse({
      logo: 'https://example.com/logo.png',
      primaryColor: '#ff5733',
      promptpayQrUrl: 'https://example.com/qr.png',
      bankName: 'SCB',
    });
    expect(result.logo).toBe('https://example.com/logo.png');
    expect(result.promptpayQrUrl).toBe('https://example.com/qr.png');
  });
});

describe('checkoutSchema', () => {
  it('applies default shipping type', () => {
    const result = checkoutSchema.parse({});
    expect(result.shippingType).toBe('STANDARD');
  });

  it('accepts valid shipping types', () => {
    for (const type of ['STANDARD', 'EXPRESS', 'PICKUP', 'COD']) {
      const result = checkoutSchema.parse({ shippingType: type });
      expect(result.shippingType).toBe(type);
    }
  });

  it('rejects invalid shipping type', () => {
    const result = checkoutSchema.safeParse({ shippingType: 'DRONE' });
    expect(result.success).toBe(false);
  });

  it('accepts optional notes', () => {
    const result = checkoutSchema.parse({ notes: 'Please deliver to back door' });
    expect(result.notes).toBe('Please deliver to back door');
  });

  it('rejects notes over 1000 chars', () => {
    const result = checkoutSchema.safeParse({ notes: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });
});
