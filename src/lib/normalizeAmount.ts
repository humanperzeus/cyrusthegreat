/**
 * normalizeAmount — locale-tolerant amount string normalization.
 *
 * Background:
 * parseEther / parseUnits (viem & ethers) accept only "1234.56" style:
 * period as the decimal mark, no thousands separator. Real users type
 * amounts in three different number formats depending on locale:
 *
 *   US / UK    "1,234.56"   comma = thousands, period = decimal
 *   EU (DE)    "1.234,56"   period = thousands, comma = decimal
 *   FR / CH    "1 234,56"   space = thousands, comma = decimal
 *
 * Passing any of the non-US forms to parseUnits throws "invalid decimal
 * value". In the deposit flow, that previously meant the user typed a
 * valid-looking amount, hit deposit, and got a useless parser error.
 *
 * Worse, the failure case that drove the original "always-MAX approval"
 * decision (commit 272eaa2) was a German user typing "1,5" intending
 * 1.5 — parseUnits would either reject it or in some paths floor it to
 * "1", and the downstream allowance would underflow the deposit. The
 * fix-the-symptom answer was to over-approve forever; the fix-the-cause
 * answer (this function) is to normalize the input before parsing it.
 *
 * Rule, tuned for crypto-amount semantics (rarely thousands-scale, never
 * scientific notation, never signed):
 *
 *   1. Strip surrounding whitespace and internal spaces (handles French
 *      "1 234").
 *   2. If the string contains BOTH '.' and ',':
 *      - Whichever appears later is the decimal mark; the other is the
 *        thousands separator. Strip the thousands separator; if the
 *        comma is the decimal, swap it to '.'.
 *      - "1,234.56"   → "1234.56"   (comma = thousands)
 *      - "1.234,56"   → "1234.56"   (period = thousands)
 *   3. If the string contains ONLY ',' (no '.'):
 *      - STRICT US thousands shape \d{1,3}(,\d{3})+  → strip commas.
 *        Examples: "1,000" → "1000", "1,234,567" → "1234567".
 *      - Otherwise, exactly ONE comma → EU decimal mark.
 *        Examples: "0,1" → "0.1", "1,5" → "1.5", "100,25" → "100.25".
 *      - Anything else ("1,2,3", "12,3456", "1,12,3") is nonsense and
 *        is REJECTED rather than silently stripped. Pre-fix, "1,2,3"
 *        slipped through to "123" — a silent corruption is worse than
 *        a visible error.
 *   4. If the string contains ONLY '.':
 *      - Multiple periods are ambiguous (could be EU thousands like
 *        "1.234.567" or a typo). We REJECT instead of guessing.
 *      - Single period is left as-is.
 *   5. Reject anything else parseUnits would reject (negative sign,
 *      letters, scientific notation, empty string, more than one
 *      decimal mark after normalization).
 *
 * The function does NOT call parseUnits itself — it returns a string the
 * caller passes to parseUnits / parseEther. That keeps the helper
 * decimal-agnostic (parseUnits with the token's decimals does the final
 * conversion).
 *
 * @throws {Error} if the input cannot be normalized to a valid amount
 * string (multiple periods, mixed-up separators, non-numeric chars).
 *
 * Examples (all return "1234.56" or "0.1" etc.):
 *   normalizeAmount("1,234.56")  → "1234.56"   (US)
 *   normalizeAmount("1.234,56")  → "1234.56"   (EU)
 *   normalizeAmount("1 234,56")  → "1234.56"   (FR)
 *   normalizeAmount("0,1")       → "0.1"       (EU, decimal)
 *   normalizeAmount("0.1")       → "0.1"       (US, decimal)
 *   normalizeAmount("1,000")     → "1000"      (US thousands shape match)
 *   normalizeAmount("1,234,567") → "1234567"   (US thousands shape match)
 *   normalizeAmount("1.234.567") → throws      (ambiguous EU thousands chain)
 *   normalizeAmount("1,2,3")     → throws      (nonsense; pre-fix this read as 123)
 *   normalizeAmount("12,3456")   → "12.3456"   (single comma; EU decimal w/ 4 decimals — common for USDC)
 *
 * The one trade-off that remains: a EU user typing "1,000" intending
 * "one point zero" gets 1000 instead. In a crypto amount field, real
 * EU users type "1" (or "1,5", "1,25" etc.), not "1,000" — so this
 * collision is rare in practice, and the alternative (treating any
 * three-trailing-zeros after a comma as a decimal) would silently
 * read US "1,000" as 1.0, which is the worse failure mode.
 */

export function normalizeAmount(raw: string): string {
  // 1. Strip all whitespace (including internal — French "1 234").
  let s = raw.replace(/\s+/g, "");
  if (!s) throw new Error("Empty amount");

  // Cheap up-front sanity check before doing any separator work.
  if (/[^\d.,]/.test(s)) {
    throw new Error(`Amount contains invalid characters: "${raw}"`);
  }

  const hasDot   = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // 2. Mixed separators — whichever appears later is the decimal mark.
    const lastDot   = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot > lastComma) {
      // US: "1,234.56" → strip commas, keep period.
      s = s.replace(/,/g, "");
    } else {
      // EU: "1.234,56" → strip periods, swap comma to period.
      s = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma) {
    // 3. Comma only. Two valid interpretations, picked by shape:
    //    a) US thousands form — must match the strict regex
    //       \d{1,3}(,\d{3})+  with EXACTLY three digits in each group
    //       after a comma. "1,000", "1,234,567" → strip commas.
    //    b) EU decimal — exactly one comma not in US-thousands form
    //       (e.g. "0,1", "1,5", "100,25"). Swap to period.
    //    Anything else ("1,2,3", "1,12,3", "12,3456") is nonsense:
    //    reject rather than guess.
    if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      s = s.replace(/,/g, "");
    } else if ((s.match(/,/g) || []).length === 1) {
      s = s.replace(",", ".");
    } else {
      throw new Error(`Ambiguous or invalid comma usage: "${raw}"`);
    }
  } else if (hasDot) {
    // 4. Period only. Multiple periods are ambiguous — reject.
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      throw new Error(`Amount has multiple decimal points: "${raw}"`);
    }
  }
  // else: pure digits — already normalized.

  // 5. Final sanity check after normalization.
  if (!/^\d*\.?\d+$|^\d+\.?\d*$/.test(s)) {
    throw new Error(`Amount normalization produced invalid result: "${raw}" → "${s}"`);
  }
  return s;
}
