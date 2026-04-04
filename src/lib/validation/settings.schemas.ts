import { z } from 'zod';

// ─── Shop Settings ──────────────────────────────────────────────────────────

export const updateShopSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  facebookPageId: z.string().max(100).nullable().optional(),
  defaultCurrency: z.enum(['THB', 'MYR', 'SGD']).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateShopInput = z.infer<typeof updateShopSchema>;

// ─── Team Member Management ─────────────────────────────────────────────────

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['MANAGER', 'CHAT_SUPPORT', 'WAREHOUSE']),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(['MANAGER', 'CHAT_SUPPORT', 'WAREHOUSE']),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

// ─── Checkout (storefront → order) ──────────────────────────────────────────

export const storefrontCheckoutSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(50),
  email: z.string().email().optional(),
  address: z.string().min(1).max(500),
  district: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  shippingType: z.enum(['STANDARD', 'EXPRESS', 'PICKUP', 'COD']).default('STANDARD'),
  notes: z.string().max(1000).optional(),
});

export type StorefrontCheckoutInput = z.infer<typeof storefrontCheckoutSchema>;
