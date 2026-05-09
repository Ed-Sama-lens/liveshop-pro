import { describe, it, expect } from 'vitest';
import {
  updateShopSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  storefrontCheckoutSchema,
} from '@/lib/validation/settings.schemas';

describe('updateShopSchema', () => {
  it('accepts valid partial update', () => {
    const result = updateShopSchema.parse({ name: 'New Shop Name' });
    expect(result.name).toBe('New Shop Name');
  });

  it('accepts empty object', () => {
    const result = updateShopSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts nullable facebookPageId', () => {
    const result = updateShopSchema.parse({ facebookPageId: null });
    expect(result.facebookPageId).toBeNull();
  });

  it('rejects empty name', () => {
    const result = updateShopSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 100 chars', () => {
    const result = updateShopSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe('inviteMemberSchema', () => {
  // Schema requires { name, username, password, role, email? }.
  // Tests pre-2026-05-09 only passed { email, role } and were stale.
  const validBase = {
    name: 'Jane Doe',
    username: 'janedoe',
    password: 'secretsecret',
  };

  it('accepts valid invite', () => {
    const result = inviteMemberSchema.parse({
      ...validBase,
      email: 'user@example.com',
      role: 'MANAGER',
    });
    expect(result.email).toBe('user@example.com');
    expect(result.role).toBe('MANAGER');
    expect(result.name).toBe('Jane Doe');
    expect(result.username).toBe('janedoe');
  });

  it('accepts all valid roles', () => {
    for (const role of ['MANAGER', 'CHAT_SUPPORT', 'WAREHOUSE']) {
      const result = inviteMemberSchema.parse({
        ...validBase,
        email: 'a@b.com',
        role,
      });
      expect(result.role).toBe(role);
    }
  });

  it('accepts invite without email (email is optional)', () => {
    const result = inviteMemberSchema.parse({
      ...validBase,
      role: 'WAREHOUSE',
    });
    expect(result.email).toBeUndefined();
    expect(result.role).toBe('WAREHOUSE');
  });

  it('rejects OWNER role', () => {
    const result = inviteMemberSchema.safeParse({
      ...validBase,
      email: 'a@b.com',
      role: 'OWNER',
    });
    expect(result.success).toBe(false);
  });

  it('rejects CUSTOMER role', () => {
    const result = inviteMemberSchema.safeParse({
      ...validBase,
      email: 'a@b.com',
      role: 'CUSTOMER',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = inviteMemberSchema.safeParse({
      ...validBase,
      email: 'not-email',
      role: 'MANAGER',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields (name, username, password)', () => {
    const result = inviteMemberSchema.safeParse({ email: 'a@b.com', role: 'MANAGER' });
    expect(result.success).toBe(false);
  });

  it('rejects username shorter than 3 chars', () => {
    const result = inviteMemberSchema.safeParse({
      ...validBase,
      username: 'ab',
      role: 'MANAGER',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 chars', () => {
    const result = inviteMemberSchema.safeParse({
      ...validBase,
      password: 'short',
      role: 'MANAGER',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateMemberRoleSchema', () => {
  it('accepts valid role', () => {
    const result = updateMemberRoleSchema.parse({ role: 'WAREHOUSE' });
    expect(result.role).toBe('WAREHOUSE');
  });

  it('rejects OWNER role', () => {
    const result = updateMemberRoleSchema.safeParse({ role: 'OWNER' });
    expect(result.success).toBe(false);
  });
});

describe('storefrontCheckoutSchema', () => {
  it('accepts valid checkout', () => {
    const result = storefrontCheckoutSchema.parse({
      name: 'John Doe',
      phone: '0812345678',
      address: '123 Main St',
      shippingType: 'EXPRESS',
    });
    expect(result.name).toBe('John Doe');
    expect(result.shippingType).toBe('EXPRESS');
  });

  it('applies default shipping type', () => {
    const result = storefrontCheckoutSchema.parse({
      name: 'Jane',
      phone: '0811111111',
      address: '456 Side St',
    });
    expect(result.shippingType).toBe('STANDARD');
  });

  it('rejects missing name', () => {
    const result = storefrontCheckoutSchema.safeParse({
      phone: '081',
      address: 'addr',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing phone', () => {
    const result = storefrontCheckoutSchema.safeParse({
      name: 'John',
      address: 'addr',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing address', () => {
    const result = storefrontCheckoutSchema.safeParse({
      name: 'John',
      phone: '081',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional email', () => {
    const result = storefrontCheckoutSchema.parse({
      name: 'John',
      phone: '081',
      address: 'addr',
      email: 'john@example.com',
    });
    expect(result.email).toBe('john@example.com');
  });

  it('rejects invalid email format', () => {
    const result = storefrontCheckoutSchema.safeParse({
      name: 'John',
      phone: '081',
      address: 'addr',
      email: 'not-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid shipping type', () => {
    const result = storefrontCheckoutSchema.safeParse({
      name: 'John',
      phone: '081',
      address: 'addr',
      shippingType: 'DRONE',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid shipping types', () => {
    for (const type of ['STANDARD', 'EXPRESS', 'PICKUP', 'COD']) {
      const result = storefrontCheckoutSchema.parse({
        name: 'John',
        phone: '081',
        address: 'addr',
        shippingType: type,
      });
      expect(result.shippingType).toBe(type);
    }
  });

  it('rejects notes over 1000 chars', () => {
    const result = storefrontCheckoutSchema.safeParse({
      name: 'John',
      phone: '081',
      address: 'addr',
      notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});
