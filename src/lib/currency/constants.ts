export const SUPPORTED_CURRENCIES = ['THB', 'MYR', 'SGD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  THB: '฿',
  MYR: 'RM',
  SGD: 'S$',
};

export const CURRENCY_NAMES: Record<SupportedCurrency, string> = {
  THB: 'Thai Baht',
  MYR: 'Malaysian Ringgit',
  SGD: 'Singapore Dollar',
};

export function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
