import {
  CURRENCY_SYMBOLS,
  type SupportedCurrency,
} from '@/lib/currency/constants';

/**
 * Get the currency symbol for a given currency code.
 * Used to display the shop's default currency symbol on prices.
 * Prices are fixed (set by admin) — no auto-conversion.
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency as SupportedCurrency] ?? currency;
}
