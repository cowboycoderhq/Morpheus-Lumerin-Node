// ============================================================================
// Remembering which providers were good to you, and which were not.
//
// Providers are addresses. They are indistinguishable in the picker except by
// price, so the only way to learn that one of them is unreachable is to pick it
// and watch a session fail — and then to remember, unaided, a 42-character hex
// string until the next time. Nobody does that. Without a memory the user meets
// the same dead provider next week and pays the same attention to find out.
//
// So: mark one up or down, and the list reorders. Deliberately NOT a filter —
// a marked-down provider still appears, at the bottom, because it may be the
// only one left, and hiding the last option is worse than showing a poor one.
// ============================================================================

export type ProviderPreference = 'favorite' | 'disliked';
export type ProviderPrefs = Record<string, ProviderPreference>;

/**
 * Addresses are compared case-insensitively.
 *
 * The same provider arrives checksummed from one route and lower-case from
 * another; two spellings of one address would be two entries, and the mark the
 * user set would appear to have been forgotten.
 */
const key = (address: string): string => String(address ?? '').toLowerCase();

export function preferenceOf(
  prefs: ProviderPrefs | null | undefined,
  address: string,
): ProviderPreference | undefined {
  return prefs?.[key(address)];
}

/**
 * Clicking the mark a provider already has clears it.
 *
 * A toggle, not a cycle: the two buttons are opposites, so pressing "favourite"
 * on a disliked provider should mean favourite, not "advance one state".
 */
export function nextPreference(
  current: ProviderPreference | undefined,
  pressed: ProviderPreference,
): ProviderPreference | undefined {
  return current === pressed ? undefined : pressed;
}

export function applyPreference(
  prefs: ProviderPrefs,
  address: string,
  next: ProviderPreference | undefined,
): ProviderPrefs {
  const out = { ...prefs };
  if (next === undefined) {
    delete out[key(address)];
  } else {
    out[key(address)] = next;
  }
  return out;
}

/**
 * Favourites first, marked-down last, price order within each band.
 *
 * Price stays the tiebreak rather than the primary sort because the marks are
 * about whether a provider WORKS, and a provider that does not work is not
 * cheap at any price. Sorting is stable within a band, so equal-priced peers
 * keep whatever order the router gave them instead of shuffling between
 * renders.
 */
export function sortProvidersByPreference<
  T extends { provider: string; stakeMorPerHour: number },
>(providers: readonly T[], prefs: ProviderPrefs | null | undefined): T[] {
  const band = (p: T): number => {
    const pref = preferenceOf(prefs, p.provider);
    if (pref === 'favorite') return 0;
    if (pref === 'disliked') return 2;
    return 1;
  };
  return [...providers].sort(
    (a, b) => band(a) - band(b) || a.stakeMorPerHour - b.stakeMorPerHour,
  );
}
