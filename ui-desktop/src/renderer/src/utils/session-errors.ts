// ============================================================================
// Turning a session-open failure into something a person can act on.
//
// The raw text is worth keeping — it is what makes a fault diagnosable, and it
// names the provider, the port and the exact refusal. It is also unreadable:
//
//   failed to initiate session: provider request failed: code: 400, msg: <nil>,
//   error: failed to decode response: read tcp 10.2.0.2:59378->82.67.174.173:3333:
//   read: connection reset by peer
//
// A person facing that cannot tell whether they were charged, whose fault it
// was, or what to do next — and the answer to all three is short: no, the
// provider's, pick another one. So both are shown: the plain sentence first,
// the raw text underneath for whoever needs it.
//
// THE CLAIM THAT MATTERS IS "were you charged". It is never guessed. Only
// failures whose position in the flow guarantees no transaction say `no`;
// everything else says `unknown` and sends the user to look, because telling
// someone their money is safe when it might not be is the one error here that
// cannot be walked back.
// ============================================================================

export type SessionFailure = {
  /** One plain sentence: what happened. No jargon, no error codes. */
  headline: string;
  /** What to do about it, in the imperative. */
  whatToDo: string;
  /**
   * Whether MOR could have been staked.
   *  - 'no'      the flow provably had not reached the transaction yet
   *  - 'unknown' it might have; say so and point at where to check
   */
  charged: 'no' | 'unknown';
  /** Offer a jump back to the provider step — only when that is the fix. */
  offerAnotherProvider: boolean;
};

/**
 * A provider that never answered.
 *
 * A session starts by asking the chosen provider to approve it; the on-chain
 * call carries that approval, so a provider that does not respond means the
 * transaction was never made. This is the one case where "nothing was staked"
 * is a fact about the protocol rather than a hope.
 */
const PROVIDER_UNREACHABLE =
  /connection reset|connection refused|no such host|i\/o timeout|context deadline exceeded|EOF|dial tcp|failed to initiate session|provider request failed|failed to decode response/i;

export function explainSessionOpenFailure(
  rawMessage: string,
  code?: string,
): SessionFailure {
  const raw = String(rawMessage ?? '');

  // Our own refusals come with a code, and each already knows its own remedy.
  if (code === 'cap_exceeded') {
    return {
      headline: 'This session costs more than the limit you set.',
      whatToDo:
        'Choose a shorter session, or raise the limit in Settings → OpenAI-compatible API.',
      charged: 'no',
      offerAnotherProvider: false,
    };
  }
  if (code === 'price_moved') {
    return {
      headline: 'The price changed while you were deciding.',
      whatToDo: 'Check the new figure and confirm again if it still suits you.',
      charged: 'no',
      offerAnotherProvider: false,
    };
  }
  if (code === 'auto_open_disabled') {
    return {
      headline: 'This app is not allowed to open sessions from outside itself.',
      whatToDo:
        'Turn on "Let /start in opencode stake MOR" in Settings → OpenAI-compatible API, then try again.',
      charged: 'no',
      offerAnotherProvider: false,
    };
  }
  if (code === 'confirmation_required') {
    return {
      headline: 'The request did not carry your confirmation.',
      whatToDo: 'Start the session again from this window.',
      charged: 'no',
      offerAnotherProvider: false,
    };
  }

  if (/insufficient|not enough|balance/i.test(raw)) {
    return {
      headline: 'There is not enough in the wallet to stake this session.',
      whatToDo:
        'Top up, or choose a shorter session — the amount to stake is shown before you confirm.',
      charged: 'no',
      offerAnotherProvider: false,
    };
  }

  if (PROVIDER_UNREACHABLE.test(raw)) {
    return {
      headline: 'The provider you picked did not respond.',
      whatToDo:
        'Choose a different provider and try again — this model has more than one, and nothing about your wallet or this app is wrong.',
      charged: 'no',
      offerAnotherProvider: true,
    };
  }

  // Anything unrecognised. Do NOT promise the money is safe.
  return {
    headline: 'The session could not be opened.',
    whatToDo:
      'Check the Sessions tab before trying again — if one opened despite this, it will be listed there.',
    charged: 'unknown',
    offerAnotherProvider: true,
  };
}
