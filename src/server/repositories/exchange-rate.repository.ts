import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@/generated/prisma';

// ─── Serialized Types ──────��─────────────────────────────────────────────────

export interface ExchangeRateRow {
  readonly id: string;
  readonly baseCurrency: string;
  readonly targetCurrency: string;
  readonly rate: string;
  readonly date: string;
  readonly source: string;
  readonly updatedAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeRate(r: {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: { toString(): string };
  date: Date;
  source: string;
  updatedAt: Date;
}): ExchangeRateRow {
  return Object.freeze({
    id: r.id,
    baseCurrency: r.baseCurrency,
    targetCurrency: r.targetCurrency,
    rate: r.rate.toString(),
    date: r.date.toISOString().slice(0, 10),
    source: r.source,
    updatedAt: r.updatedAt,
  });
}

// ─── Repository ──────────────────────────────────────────────────────────────

export const exchangeRateRepository = Object.freeze({
  /**
   * Get the latest rates for all currency pairs.
   */
  async getLatestRates(): Promise<readonly ExchangeRateRow[]> {
    // Get the most recent date that has rates
    const latest = await prisma.exchangeRate.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    if (!latest) return [];

    const rates = await prisma.exchangeRate.findMany({
      where: { date: latest.date },
      orderBy: [{ baseCurrency: 'asc' }, { targetCurrency: 'asc' }],
    });

    return Object.freeze(rates.map(serializeRate));
  },

  /**
   * Get rates for a specific date.
   */
  async getRatesByDate(date: string): Promise<readonly ExchangeRateRow[]> {
    const rates = await prisma.exchangeRate.findMany({
      where: { date: new Date(date) },
      orderBy: [{ baseCurrency: 'asc' }, { targetCurrency: 'asc' }],
    });
    return Object.freeze(rates.map(serializeRate));
  },

  /**
   * Get rate history for a currency pair.
   */
  async getHistory(
    baseCurrency: string,
    targetCurrency: string,
    days: number = 30
  ): Promise<readonly ExchangeRateRow[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const rates = await prisma.exchangeRate.findMany({
      where: {
        baseCurrency,
        targetCurrency,
        date: { gte: fromDate },
      },
      orderBy: { date: 'desc' },
    });
    return Object.freeze(rates.map(serializeRate));
  },

  /**
   * Upsert a single rate.
   */
  async upsertRate(input: {
    baseCurrency: string;
    targetCurrency: string;
    rate: number;
    date: string;
    source?: string;
  }): Promise<ExchangeRateRow> {
    const dateObj = new Date(input.date);
    const rate = await prisma.exchangeRate.upsert({
      where: {
        baseCurrency_targetCurrency_date: {
          baseCurrency: input.baseCurrency,
          targetCurrency: input.targetCurrency,
          date: dateObj,
        },
      },
      create: {
        baseCurrency: input.baseCurrency,
        targetCurrency: input.targetCurrency,
        rate: input.rate,
        date: dateObj,
        source: input.source ?? 'manual',
      },
      update: {
        rate: input.rate,
        source: input.source ?? 'manual',
      },
    });
    return serializeRate(rate);
  },

  /**
   * Bulk upsert rates for a date (used by auto-fetch).
   */
  async bulkUpsert(
    rates: readonly {
      baseCurrency: string;
      targetCurrency: string;
      rate: number;
    }[],
    date: string,
    source: string = 'api'
  ): Promise<number> {
    const dateObj = new Date(date);
    let count = 0;

    for (const r of rates) {
      await prisma.exchangeRate.upsert({
        where: {
          baseCurrency_targetCurrency_date: {
            baseCurrency: r.baseCurrency,
            targetCurrency: r.targetCurrency,
            date: dateObj,
          },
        },
        create: {
          baseCurrency: r.baseCurrency,
          targetCurrency: r.targetCurrency,
          rate: r.rate,
          date: dateObj,
          source,
        },
        update: {
          rate: r.rate,
          source,
        },
      });
      count++;
    }

    return count;
  },

  /**
   * Convert an amount between currencies using the latest rate.
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<{ converted: number; rate: string } | null> {
    if (fromCurrency === toCurrency) {
      return { converted: amount, rate: '1' };
    }

    const rateRecord = await prisma.exchangeRate.findFirst({
      where: { baseCurrency: fromCurrency, targetCurrency: toCurrency },
      orderBy: { date: 'desc' },
    });

    if (!rateRecord) return null;

    const rate = Number(rateRecord.rate);
    return {
      converted: Math.round(amount * rate * 100) / 100,
      rate: rateRecord.rate.toString(),
    };
  },
});
