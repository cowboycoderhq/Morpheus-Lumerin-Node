// ============================================================================
// When may the app interrupt you to offer a paid session?
//
// A terminal agent naming a starred model with no session gets a refusal, and
// that refusal is what tells the app a human wants this model. The app then brings
// itself forward with the picker. That is a window stealing focus in response to
// an HTTP request, so the question "may we ask?" needs an answer that does not
// depend on the caller being well behaved:
//
//  - Agents send CONCURRENT requests. grok fires a hidden title-generation call
//    alongside the real turn; both can name the same model. Two offers for one
//    intent would let a distracted user open two sessions and pay twice.
// There is NO cooldown after a dismissal, and there used to be.
//
// It was insurance against an agent retrying in a loop and nagging someone into
// clicking the expensive button. Measured on both clients, that loop does not
// happen: a clean 400 gets ONE request per user send from grok and from
// opencode, and neither reissues it. (The 8-retries-in-2-minutes figure that
// justified the cooldown came from a MALFORMED response — a 200 whose body was
// not SSE — which is a different bug, fixed separately and pinned by its own
// check.)
//
// So the cooldown suppressed nothing an agent does, and everything a person
// does: cancel, think, ask again, get silence. The reported symptom — "it only
// works the first time" — was the guard, not a fault it was guarding against.
//
// What remains is COALESCING, which is not rate-limiting: while a dialog for a
// model is genuinely up, a second request for that same model must not replace
// it mid-decision and orphan the first. The TTL is only a backstop for a dialog
// that never reports back.
// ============================================================================

/** An offer waiting for a renderer able to show it. */
export type QueuedOffer = { modelId: string; advertised: string; at: number };

/**
 * Which queued offer should a freshly mounted picker show, and which are dead?
 *
 * Pure, because the interesting rules are the boring ones: show the NEWEST (if
 * a user has refused nothing and asked for two models, the second is what they
 * are looking at), and treat anything past the window as abandoned rather than
 * ambushing them with a spend prompt for a request they made twenty minutes ago
 * and have forgotten.
 */
export function claimNewestOffer(
  offers: Iterable<[number, QueuedOffer]>,
  now: number,
  ttlMs: number = OFFER_TTL_MS,
): {
  claim: { requestId: number; args: string } | null;
  expired: { requestId: number; modelId: string }[];
} {
  const expired: { requestId: number; modelId: string }[] = [];
  let claim: { requestId: number; args: string } | null = null;
  let newestAt = -Infinity;
  for (const [requestId, offer] of offers) {
    if (now - offer.at >= ttlMs) {
      expired.push({ requestId, modelId: offer.modelId });
      continue;
    }
    if (offer.at >= newestAt) {
      newestAt = offer.at;
      claim = { requestId, args: offer.advertised };
    }
  }
  return { claim, expired };
}

/** Why the gate answered as it did — surfaced in logs, never to the caller. */
export type OfferDecision =
  | { offer: true }
  /**
   * Refused, with how long until it would be allowed.
   *
   * The caller needs `retryInMs` because a suppressed offer used to be
   * completely silent: the terminal said "no session", the window did not
   * appear, and nothing anywhere said why or for how long. Silence that looks
   * identical to a broken feature is worse than the nag it was avoiding.
   */
  | { offer: false; reason: 'in_flight'; retryInMs: number };

export type OfferGateOptions = {
  /** Injected so tests do not sleep. */
  now?: () => number;
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

/**
 * How long an offer stays live before it is treated as abandoned.
 *
 * Shared with whatever holds the offer for a renderer that is not showing yet —
 * a locked app queues it until unlock — so the queue and the gate cannot
 * disagree about whether an offer is still worth showing.
 */
export const OFFER_TTL_MS = 2 * 60_000;

type Entry = { inFlightAt: number };

export class SessionOfferGate {
  private readonly now: () => number;
  private readonly inFlightTtlMs: number;
  private readonly byModel = new Map<string, Entry>();

  constructor(options: OfferGateOptions = {}) {
    this.now = options.now ?? Date.now;
    this.inFlightTtlMs = options.inFlightTtlMs ?? OFFER_TTL_MS;
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
    this.forget(t);
    const entry = this.byModel.get(modelId);

    if (entry && t - entry.inFlightAt < this.inFlightTtlMs) {
      return {
        offer: false,
        reason: 'in_flight',
        retryInMs: entry.inFlightAt + this.inFlightTtlMs - t,
      };
    }

    this.byModel.set(modelId, { inFlightAt: t });
    return { offer: true };
  }

  /**
   * Record what the human did. Either answer FREES the model.
   *
   * `opened` because it now has a session; `declined` because a person who
   * closed a dialog and then asked again wants the dialog, and making them wait
   * for it is the behaviour this gate was reported as a bug for.
   */
  settle(modelId: string): void {
    this.byModel.delete(modelId);
  }

  /**
   * Drop entries that can no longer affect a decision.
   *
   * A decline used to leave a record that outlived its own cooldown, so the map
   * accumulated one entry per model ever refused and never shed any. Bounded by
   * the catalog rather than unbounded, which is why it was easy to miss — and
   * exactly the kind of thing that is free to fix now and archaeology later.
   */
  private forget(t: number): void {
    for (const [id, e] of this.byModel) {
      if (t - e.inFlightAt >= this.inFlightTtlMs) this.byModel.delete(id);
    }
  }

  /** How many models the gate is still tracking. Diagnostic only. */
  tracking(): number {
    return this.byModel.size;
  }

  /** Test/diagnostic view. Never used to make a decision. */
  pending(): string[] {
    const t = this.now();
    return [...this.byModel.entries()]
      .filter(([, e]) => t - e.inFlightAt < this.inFlightTtlMs)
      .map(([id]) => id);
  }
}
