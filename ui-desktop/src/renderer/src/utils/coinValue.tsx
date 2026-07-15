export const lmrDecimals = 10 ** 18;
export const ethDecimals = 10 ** 18;

export const fromTokenBaseUnitsToLMR = (baseUnits) => baseUnits / lmrDecimals;

export const fromTokenBaseUnitsToETH = (baseUnits) => baseUnits / ethDecimals;

export const formatValue = (valueWithDecimals: number, decimals = 18) => {
  const value = valueWithDecimals / 10 ** decimals;
  return value.toFixed(2);
};

/**
 * Format a MOR amount for display WITHOUT collapsing small amounts to "0.00".
 *
 * Session stakes are genuinely tiny for cheap models — a 5-minute session on
 * llama-3.2-3b stakes ~0.0009 MOR — so `formatValue`'s fixed 2 decimals renders
 * a real, non-zero requirement as "0.00" and produces sentences like
 * "a session needs at least 0.00 MOR". Scale the precision to the magnitude.
 *
 * Returns null when the amount is not a usable number (NaN/Infinity), which is
 * what happens before the marketplace meta (supply/budget) has loaded and the
 * stake divides by zero. Callers MUST handle null by not asserting a figure —
 * printing a placeholder number is how the nonsense sentence got shipped.
 */
export const formatMor = (valueWithDecimals: number, decimals = 18): string | null => {
  const value = valueWithDecimals / 10 ** decimals;
  if (!Number.isFinite(value)) return null;
  if (value === 0) return '0';
  // Scientific notation ("4.78e-6 MOR") is unreadable in product copy. Below the
  // last digit we show, say so plainly instead.
  if (value < 0.000001) return '< 0.000001';
  if (value < 1) return String(Number(value.toFixed(6)));
  if (value < 1000) return value.toFixed(2);
  return Math.round(value).toLocaleString();
};
