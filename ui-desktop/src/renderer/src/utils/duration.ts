// ============================================================================
// Typed session lengths — "1 day", "2 years", "90m".
//
// This replaces a slider. A slider cannot express the range the chain actually
// allows (5 minutes to years) without either a useless resolution at the short
// end or a comically long track, so the length is typed instead. The unit is
// free text with OPTIONAL completion: every alias below parses, and the
// suggestion list is a convenience, never a constraint.
//
// Parsing a duration is a MONEY operation here — the number it returns is
// multiplied into a stake. So it refuses rather than guesses: a bare number
// with no unit is an error, not an assumed "minutes". Being wrong by 60x on a
// stake is not a recoverable UX papercut.
// ============================================================================

export const SECOND = 1;
export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
// Calendar months and years vary; a session is a fixed number of seconds, so
// these are the conventional fixed approximations. Both are only ever reachable
// above the chain's per-session cap, where the length is a PLAN made of chained
// sessions rather than one purchase — so the approximation never silently
// mis-prices a single stake.
export const MONTH = 30 * DAY;
export const YEAR = 365 * DAY;

type UnitDef = {
  /** The name shown in suggestions and echoed back to the user. */
  canonical: string;
  /** Singular form, used when the scalar is exactly 1. */
  singular: string;
  seconds: number;
  /** Every spelling that parses. Matched EXACTLY, never by prefix. */
  aliases: string[];
};

// Order matters: this is the order suggestions appear in.
export const UNITS: UnitDef[] = [
  {
    canonical: 'seconds',
    singular: 'second',
    seconds: SECOND,
    aliases: ['s', 'sec', 'secs', 'second', 'seconds'],
  },
  {
    canonical: 'minutes',
    singular: 'minute',
    seconds: MINUTE,
    aliases: ['m', 'min', 'mins', 'minute', 'minutes'],
  },
  {
    canonical: 'hours',
    singular: 'hour',
    seconds: HOUR,
    aliases: ['h', 'hr', 'hrs', 'hour', 'hours'],
  },
  {
    canonical: 'days',
    singular: 'day',
    seconds: DAY,
    aliases: ['d', 'day', 'days'],
  },
  {
    canonical: 'weeks',
    singular: 'week',
    seconds: WEEK,
    aliases: ['w', 'wk', 'wks', 'week', 'weeks'],
  },
  {
    // 'm' is minutes and 'mo' is months. Exact-alias matching is what keeps
    // that unambiguous — a prefix match would make "m" mean either, and the
    // wrong one is a 43,200x error in the stake.
    //
    // Input is case-folded, so "5M" is five MINUTES, not the ISO-8601 reading
    // of five months. Deliberate: it errs toward under-buying, the field echoes
    // "5 minutes" straight back, and the one genuinely confusing case ("1M")
    // fails closed against the 5-minute contract floor.
    canonical: 'months',
    singular: 'month',
    seconds: MONTH,
    aliases: ['mo', 'mos', 'month', 'months'],
  },
  {
    canonical: 'years',
    singular: 'year',
    seconds: YEAR,
    aliases: ['y', 'yr', 'yrs', 'year', 'years'],
  },
];

/**
 * Upper bound on what may be TYPED. Not a chain rule — the chain caps a single
 * session (see getMaxSessionDuration) and this caps the plan built from them.
 * It exists so a fat-fingered "100000 years" cannot ask the app to schedule
 * five million sessions.
 */
export const MAX_TYPEABLE_SECONDS = 10 * YEAR;

export type ParsedDuration =
  | { ok: true; seconds: number }
  | { ok: false; error: string; incomplete: boolean };

const SHAPE = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/;

/**
 * Parse a typed session length into seconds.
 *
 * `incomplete: true` marks input that is on its way to being valid ("2", "2 d"
 * mid-keystroke) rather than wrong. Callers use it to stay quiet while typing
 * instead of flashing an error at every character.
 */
export function parseDuration(input: string): ParsedDuration {
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw) {
    return { ok: false, error: '', incomplete: true };
  }

  const match = SHAPE.exec(raw);
  if (!match) {
    return {
      ok: false,
      error: 'Enter a length like “30 minutes”, “1 day” or “2 years”.',
      incomplete: false,
    };
  }

  const [, scalarText, unitText] = match;
  const scalar = Number(scalarText);
  if (!Number.isFinite(scalar)) {
    return {
      ok: false,
      error: 'Enter a length like “30 minutes”, “1 day” or “2 years”.',
      incomplete: false,
    };
  }

  if (!unitText) {
    return {
      ok: false,
      error: 'Add a unit — minutes, hours, days, weeks, months or years.',
      incomplete: true,
    };
  }

  const unit = UNITS.find((u) => u.aliases.includes(unitText));
  if (!unit) {
    // Still a prefix of something real ("mi", "ye") — the user is mid-word.
    const couldBecomeValid = UNITS.some((u) =>
      u.aliases.some((a) => a.startsWith(unitText)),
    );
    return {
      ok: false,
      error: couldBecomeValid
        ? 'Add a unit — minutes, hours, days, weeks, months or years.'
        : `“${unitText}” isn’t a unit of time. Try minutes, hours, days, weeks, months or years.`,
      incomplete: couldBecomeValid,
    };
  }

  if (scalar <= 0) {
    return {
      ok: false,
      error: 'A session needs a length greater than zero.',
      incomplete: false,
    };
  }

  // Round rather than floor: "1.5 minutes" is 90s exactly, and float residue on
  // a value that gets multiplied into a stake should not survive.
  const seconds = Math.round(scalar * unit.seconds);

  // Guard the ROUNDED value, not just the scalar. "0.4 seconds" is a positive
  // scalar that rounds to zero, and returning ok:true with seconds:0 would hand
  // the next caller a zero-length session that reads as valid.
  if (seconds <= 0) {
    return {
      ok: false,
      error: 'A session needs a length greater than zero.',
      incomplete: false,
    };
  }

  if (seconds > MAX_TYPEABLE_SECONDS) {
    return {
      ok: false,
      error: 'That’s longer than 10 years — pick something shorter.',
      incomplete: false,
    };
  }

  return { ok: true, seconds };
}

/**
 * Unit completions for what has been typed so far. Feeds a `<datalist>`, so the
 * user may pick one or ignore it entirely — the field stays free text.
 *
 * Returns whole phrases ("2 days", "2 months") rather than bare units, because
 * a datalist replaces the field's entire value when an option is chosen.
 */
export function durationSuggestions(input: string): string[] {
  const raw = (input ?? '').trim().toLowerCase();
  const match = SHAPE.exec(raw);
  // Nothing typed yet, or something unparseable: offer a starting vocabulary
  // rather than an empty dropdown.
  if (!match) {
    return ['30 minutes', '1 hour', '8 hours', '1 day', '1 week', '1 month'];
  }

  const [, scalarText, unitText] = match;
  const scalar = Number(scalarText);
  const matching = unitText
    ? UNITS.filter((u) => u.aliases.some((a) => a.startsWith(unitText)))
    : UNITS;

  return matching.map(
    (u) => `${scalarText} ${scalar === 1 ? u.singular : u.canonical}`,
  );
}

/**
 * Human-readable length, EXACT — every non-zero unit, no truncation.
 *
 * This echoes a length the user is buying, so it is not a summary. Capping the
 * output at two units read "1.983 years" back as "1 year 11 months", 4% less
 * than what gets staked; raising the cap to three only shrank the lie to 0.25%
 * (up to 24 hours can still go unnamed). A number the screen and the stake
 * disagree about is the exact failure this surface exists to prevent, so the
 * cap is gone. Round inputs — the overwhelming majority — are unaffected:
 * 2 years is still "2 years".
 */
export function formatDurationLong(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  if (total === 0) {
    return '0 seconds';
  }

  const parts: string[] = [];
  let remaining = total;
  for (const unit of [...UNITS].reverse()) {
    // Weeks read oddly between days and months ("1 month 2 weeks"), and months
    // are an approximation — skip both in OUTPUT and let days carry the middle.
    if (unit.canonical === 'weeks') {
      continue;
    }
    const count = Math.floor(remaining / unit.seconds);
    if (count > 0) {
      parts.push(`${count} ${count === 1 ? unit.singular : unit.canonical}`);
      remaining -= count * unit.seconds;
    }
  }
  return parts.join(' ') || '0 seconds';
}

/** Compact form for tight spots — "2y 15d", "8h 5m", "5m". */
export function formatDurationShort(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const suffix: Record<string, string> = {
    years: 'y',
    months: 'mo',
    days: 'd',
    hours: 'h',
    minutes: 'm',
    seconds: 's',
  };
  const parts: string[] = [];
  let remaining = total;
  for (const unit of [...UNITS].reverse()) {
    if (unit.canonical === 'weeks') {
      continue;
    }
    const count = Math.floor(remaining / unit.seconds);
    if (count > 0) {
      parts.push(`${count}${suffix[unit.canonical]}`);
      remaining -= count * unit.seconds;
    }
    if (parts.length === 2) {
      break;
    }
  }
  return parts.join(' ') || '0s';
}
