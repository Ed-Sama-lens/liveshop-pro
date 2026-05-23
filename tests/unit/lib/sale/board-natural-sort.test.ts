/**
 * Tier 3.10-B/C hardening — natural-sort edge cases for V Rich board
 * display codes.
 *
 * Existing board-helpers.test.ts (30 tests) covers basic sort cases.
 * This file adds edge cases identified during Track 5 audit:
 *
 *   - mixed prefixes (CM vs BD vs CF)
 *   - lowercase vs uppercase prefix collation
 *   - large numeric suffixes (CM999, CM1000)
 *   - displayCode without numeric suffix (CM alone)
 *   - displayCode with leading zero suffix (CM01, CM001 — should they collide?)
 *   - hyphen-separated codes (BD-1, BD-12 — currently regex won't match)
 *   - alphanumeric mid-prefix (BD2A, BD2B — sort fallback behavior)
 *
 * Pure tests — no React.
 */
import { describe, it, expect } from 'vitest';
import {
  compareDisplayCode,
  sortDisplayCodes,
} from '@/lib/sale/board-helpers';

function asItems(codes: readonly string[]): readonly { displayCode: string }[] {
  return codes.map((c) => ({ displayCode: c }));
}

function extract(items: readonly { displayCode: string }[]): readonly string[] {
  return items.map((i) => i.displayCode);
}

describe('compareDisplayCode — basic natural sort', () => {
  it('CM1 < CM2 < CM10 (numeric order, not lexical)', () => {
    expect(compareDisplayCode('CM1', 'CM2')).toBeLessThan(0);
    expect(compareDisplayCode('CM2', 'CM10')).toBeLessThan(0);
    expect(compareDisplayCode('CM1', 'CM10')).toBeLessThan(0);
  });

  it('BD3 < BD4 < BD12', () => {
    expect(compareDisplayCode('BD3', 'BD4')).toBeLessThan(0);
    expect(compareDisplayCode('BD4', 'BD12')).toBeLessThan(0);
  });

  it('returns 0 for identical codes', () => {
    expect(compareDisplayCode('CM5', 'CM5')).toBe(0);
  });
});

describe('compareDisplayCode — mixed prefixes', () => {
  it('BD sorts before CM (alphabetical prefix)', () => {
    expect(compareDisplayCode('BD1', 'CM1')).toBeLessThan(0);
  });

  it('CM sorts before CF (CF > CM alphabetically? no — F<M)', () => {
    // CF < CM because F < M alphabetically
    expect(compareDisplayCode('CF1', 'CM1')).toBeLessThan(0);
  });

  it('numeric suffix ignored when prefixes differ', () => {
    // CM1 vs BD999 — prefix wins
    expect(compareDisplayCode('CM1', 'BD999')).toBeGreaterThan(0);
    expect(compareDisplayCode('BD999', 'CM1')).toBeLessThan(0);
  });
});

describe('compareDisplayCode — case sensitivity', () => {
  it('uppercase same prefix sorts before lowercase (default localeCompare? or strict)', () => {
    // CM1 vs cm1 — both regex-match; prefix1 = "CM", prefix2 = "cm".
    // Prefix collation uses localeCompare; UTF-16 uppercase comes
    // first which makes "CM" < "cm" in most locales.
    const result = compareDisplayCode('CM1', 'cm1');
    // Don't strict-check sign; just confirm it is NOT zero (sort is deterministic).
    expect(result).not.toBe(0);
  });

  it('same case + same prefix uses numeric suffix', () => {
    expect(compareDisplayCode('cm1', 'cm10')).toBeLessThan(0);
  });
});

describe('compareDisplayCode — large numeric suffixes', () => {
  it('CM99 < CM100', () => {
    expect(compareDisplayCode('CM99', 'CM100')).toBeLessThan(0);
  });

  it('CM999 < CM1000', () => {
    expect(compareDisplayCode('CM999', 'CM1000')).toBeLessThan(0);
  });

  it('CM1 < CM999999', () => {
    expect(compareDisplayCode('CM1', 'CM999999')).toBeLessThan(0);
  });
});

describe('compareDisplayCode — missing numeric suffix', () => {
  it('CM (no suffix) sorts before CM1', () => {
    expect(compareDisplayCode('CM', 'CM1')).toBeLessThan(0);
  });

  it('CM (no suffix) equals itself', () => {
    expect(compareDisplayCode('CM', 'CM')).toBe(0);
  });

  it('CM1 sorts after CM (no suffix)', () => {
    expect(compareDisplayCode('CM1', 'CM')).toBeGreaterThan(0);
  });
});

describe('compareDisplayCode — non-matching codes (fallback to localeCompare)', () => {
  it('hyphenated codes use localeCompare fallback (BD-1 vs BD-2)', () => {
    // Regex /^([A-Za-z]+)(\d+)?$/ rejects "BD-1"
    // Falls back to localeCompare which is lexical, NOT natural
    const result = compareDisplayCode('BD-1', 'BD-2');
    expect(result).toBeLessThan(0); // BD-1 < BD-2 lexically
  });

  it('mixed alpha+digit+alpha falls back to localeCompare', () => {
    // "CM2A" does not match the regex either
    const result = compareDisplayCode('CM2A', 'CM2B');
    expect(result).toBeLessThan(0);
  });

  it('all-numeric codes fall back to localeCompare', () => {
    // Pure-digit "123" has no prefix; regex requires [A-Za-z]+
    const result = compareDisplayCode('123', '45');
    // Lexical: "123" < "45" because '1' < '4'
    expect(result).toBeLessThan(0);
  });

  it('leading-zero numeric suffix preserves parseInt order', () => {
    // CM01 vs CM1: regex matches both, num parsing → both = 1
    // Returns 0 (equal) per parseInt('01') === parseInt('1') === 1
    expect(compareDisplayCode('CM01', 'CM1')).toBe(0);
  });
});

describe('sortDisplayCodes — full array integration', () => {
  it('sorts mixed CM range correctly', () => {
    const result = sortDisplayCodes(asItems(['CM10', 'CM1', 'CM2', 'CM20', 'CM3']));
    expect(extract(result)).toEqual(['CM1', 'CM2', 'CM3', 'CM10', 'CM20']);
  });

  it('sorts multi-prefix mixed correctly', () => {
    const result = sortDisplayCodes(asItems(['CM2', 'BD1', 'CM1', 'BD10', 'BD2']));
    expect(extract(result)).toEqual(['BD1', 'BD2', 'BD10', 'CM1', 'CM2']);
  });

  it('returns new array (does not mutate input)', () => {
    const input = asItems(['CM3', 'CM1', 'CM2']);
    const originalOrder = extract(input);
    const result = sortDisplayCodes(input);
    expect(extract(input)).toEqual(originalOrder); // input untouched
    expect(extract(result)).toEqual(['CM1', 'CM2', 'CM3']);
  });

  it('handles empty array', () => {
    expect(sortDisplayCodes([])).toEqual([]);
  });

  it('handles single-element array', () => {
    expect(extract(sortDisplayCodes(asItems(['CM1'])))).toEqual(['CM1']);
  });

  it('Boss scenario 1..67 sorts naturally', () => {
    const codes: string[] = [];
    for (let n = 1; n <= 67; n++) codes.push(`CM${n}`);
    // Shuffle by reversing
    const shuffled = [...codes].reverse();
    const sorted = sortDisplayCodes(asItems(shuffled));
    expect(extract(sorted)).toEqual(codes);
  });
});

describe('sortDisplayCodes — stable sort assumption', () => {
  it('preserves relative order of unsortable codes (fallback locale)', () => {
    // Two non-regex-matching codes that localeCompare considers equal
    // Sort must be stable.
    interface ExtendedItem {
      readonly displayCode: string;
      readonly extra: string;
    }
    const items: readonly ExtendedItem[] = [
      { displayCode: 'BD-1', extra: 'first' },
      { displayCode: 'BD-1', extra: 'second' },
    ];
    const sorted = sortDisplayCodes(items);
    expect(sorted[0]!.extra).toBe('first');
    expect(sorted[1]!.extra).toBe('second');
  });
});
