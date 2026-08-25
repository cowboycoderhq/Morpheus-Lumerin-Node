// ============================================================================
// When may the app interrupt you to offer a paid session?
//
// A terminal agent naming a starred model with no session gets a 402, and that
// refusal is what tells the app a human wants this model. The app then brings
// itself forward with the picker. That is a window stealing focus in response to
// an HTTP request, so the question "may we ask?" needs an answer that does not
// depend on the caller being well behaved:
//
//  - Agents send CONCURRENT requests. grok fires a hidden title-generation call
//    alongside the real turn; both can name the same model. Two offers for one
//    intent would let a distracted user open two sessions and pay twice.
//  - Agents RETRY. Measured: grok reissued a request 8 times in 2 minutes when a
//    response was malformed. Without a cooldown, cancelling an offer just means
//    the window comes back, and back, until the user clicks the expensive button
//    to make it stop. That is a spending decision made by fatigue.
//
// So: one offer in flight per model, and a decline buys quiet for a while. The
// gate is pure and takes its clock, so both rules are testable without waiting.
// ============================================================================

/** Why the gate answered as it did — surfaced in logs, never to the caller. */
export type OfferDecision =
  | { offer: true }
  | { offer: false; reason: 'in_flight' | 'cooling_down' };

export type OfferGateOptions = {
  /** Injected so tests do not sleep. */
  now?: () => number;
  /** Quiet period after the user declines an offer for a model. */
  cooldownMs?: number;
  /**
   * How long an unanswered offer holds the model.
   *
   * Without this, a renderer that is closed, crashes, or is never looked at
   * would wedge that model as permanently "in flight" and the user could never
   * be offered it again — a silent, unrecoverable dead end. Expiry makes the
   * failure temporary instead.
   */
  inFlightTtlMs?: number;
};

type Entry = { inFlightAt?: number; quietUntil?: number };

export class SessionOfferGate {
  private readonly now: () => number;
  private readonly cooldownMs: number;
  private readonly inFlightTtlMs: number;
  private readonly byModel = new Map<string, Entry>();

  constructor(options: OfferGateOptions = {}) {
    this.now = options.now ?? Date.now;
    this.cooldownMs = options.cooldownMs ?? 5 * 60_000;
    this.inFlightTtlMs = options.inFlightTtlMs ?? 10 * 60_000;
  }

  /**
   * Ask whether to offer a session for this model, and claim the slot if so.
   *
   * Claiming happens HERE rather than in a separate call because the caller is
   * handling concurrent requests: any gap between "may I?" and "I am" is a race
   * where two requests both pass.
   */
  request(modelId: string): OfferDecision {
    const t = this.now();
    const entry = this.byModel.get(modelId) ?? {};

    if (entry.quietUntil !== undefined && t < entry.quietUntil) {
      return { offer: false, reason: 'cooling_down' };
    }
    if (
      entry.inFlightAt !== undefined &&
      t - entry.inFlightAt < this.inFlightTtlMs
    ) {
      return { offer: false, reason: 'in_flight' };
    }

    this.byModel.set(modelId, { inFlightAt: t });
    return { offer: true };
  }

  /**
   * Record what the human did.
   *
   * `opened` clears everything: the model now has a session, so the next request
   * succeeds and there is nothing to be quiet about. `declined` starts the
   * cooldown — this is the case a retry loop would otherwise exploit.
   */
  settle(modelId: string, outcome: 'opened' | 'declined'): void {
    if (outcome === 'opened') {
      this.byModel.delete(modelId);
      return;
    }
    this.byModel.set(modelId, { quietUntil: this.now() + this.cooldownMs });
  }

  /** Test/diagnostic view. Never used to make a decision. */
  pending(): string[] {
    const t = this.now();
    return [...this.byModel.entries()]
      .filter(
        ([, e]) =>
          e.inFlightAt !== undefined && t - e.inFlightAt < this.inFlightTtlMs,
      )
      .map(([id]) => id);
  }
}
