// ============================================================================
// What changed, told to the person who already has the app.
//
// A tester who updates sees nothing: the setup wizard is behind them, and every
// new capability is a screen they have no reason to open. So the app says so
// itself, once per version, with the actions built in — reading about pinning
// and then having to go and find where to pin is how a feature stays unused.
//
// TO ADD A RELEASE: put a new entry at the TOP. Keep it to what a user can
// notice or do; a changelog of refactors belongs in the git log. Actions are
// declarative so the modal stays dumb and this file stays the only thing anyone
// edits at release time.
// ============================================================================

export type ReleaseAction =
  /** Runs grok's own installer, shown only when grok is missing. */
  | { kind: 'install-grok'; label: string }
  /** Sends them to the pinning UI in Settings. */
  | { kind: 'pin-models'; label: string }
  /** Opens Settings at the endpoint card. */
  | { kind: 'open-settings'; label: string };

export type ReleaseNote = {
  version: string;
  /** One line, present tense, no version number — the heading says that. */
  headline: string;
  items: { title: string; body: string }[];
  actions?: ReleaseAction[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.1.3',
    headline: 'The setup freeze was never a freeze.',
    items: [
      {
        title: 'Switching away no longer stops the app',
        body:
          'Setup takes a few minutes, so people switched to another window while they waited — and macOS stopped drawing this one. The spinner froze mid-turn and the app looked dead while it was in perfect health. It keeps running in the background now.',
      },
      {
        title: 'A broken screen says so',
        body:
          'An error while drawing used to blank the whole app silently, with nothing written down. Now it shows what happened, records it, and offers a reload.',
      },
      {
        title: 'No more early false alarm',
        body:
          '“Setup stopped making progress” could appear about half a minute before setup finished normally. It now waits well past a real slow start.',
      },
    ],
    actions: [{ kind: 'pin-models', label: 'Pin my models' }],
  },
  {
    // Written for someone coming from 1.1.1, which they DID receive — so this
    // one leads with what changed rather than re-teaching the feature. The
    // 1.1.1 entry below still carries the full introduction for anyone who
    // skipped it.
    version: '1.1.2',
    headline: 'Terminal sessions, minus the friction.',
    items: [
      {
        title: 'One switch, not four',
        body:
          'Turning on the OpenAI-compatible endpoint is now the whole setup. The permission toggles and the spend caps are gone: nothing but this app can open a session, so there was no unattended spending left to bound. Every session is still you, looking at a price, clicking confirm.',
      },
      {
        title: 'Ask again and the window comes back',
        body:
          'Closing an offer used to buy five minutes of silence, so the app appeared to work only once. It frees the model immediately now, and if a dialog really is already open the terminal says so instead of saying nothing.',
      },
      {
        title: 'A fresh offer is a fresh dialog',
        body:
          'Leaving a completed session on screen no longer means the next request shows you the last one’s “Open in grok”.',
      },
      {
        title: 'Setup that stops tells you why',
        body:
          'If installation stops making progress, you get the step it was waiting on, the error, and the app’s own log with one button to copy it — instead of a spinner that never ends.',
      },
      {
        title: 'Install grok from Settings',
        body:
          'A button, next to the one for opencode, running the installer x.ai documents.',
      },
    ],
    actions: [
      { kind: 'pin-models', label: 'Pin my models' },
      { kind: 'install-grok', label: 'Install grok' },
    ],
  },
  {
    // Carries 1.1.0's items as well as its own fixes: for most testers this is
    // the FIRST notice they will see (1.1.0's never appeared), and a note that
    // assumes they read the previous one would tell them about repairs to
    // features they have never heard of.
    version: '1.1.1',
    headline: 'Your Morpheus models now work inside your terminal.',
    items: [
      {
        title: 'Pin models, and they appear in grok and opencode',
        body:
          'Pick the models you want on hand in Settings → OpenAI-compatible API. They show up in your terminal’s model picker whether or not a session is open — so the list stops changing under you, and you stop restarting your agent to see it.',
      },
      {
        title: 'Use one without a session and the app offers to open it',
        body:
          'No error to decode: your terminal says a session is needed, this window comes forward with the price, the provider and the length, and you approve it here. No model ever decides to spend.',
      },
      {
        title: 'Mark providers up or down',
        body:
          'A provider that ignored you sinks to the bottom of the list next time. One that worked leads it. Your marks are remembered per provider.',
      },
      {
        title: 'Failures explain themselves',
        body:
          'When a session cannot open you get a sentence, not a stack trace — what happened, whether anything was staked, and the one button that fixes it.',
      },
      {
        title: 'Fixed since 1.1.0',
        body:
          'Opening a session from this window no longer asks you to grant an outside tool permission to spend — that was backwards. References to /start are gone, since it never worked. And this notice now appears at all, which in 1.1.0 it did not.',
      },
    ],
    actions: [
      { kind: 'pin-models', label: 'Pin my models' },
      { kind: 'install-grok', label: 'Install grok' },
    ],
  },
  {
    version: '1.1.0',
    headline: 'Your Morpheus models now work inside your terminal.',
    items: [
      {
        title: 'Pin models, and they appear in grok and opencode',
        body:
          'Pick the models you want on hand. They show up in your terminal’s model picker whether or not a session is open — so the list stops changing under you, and you stop restarting your agent to see it.',
      },
      {
        title: 'Use one without a session and the app offers to open it',
        body:
          'No error to decode: your terminal says a session is needed, this window comes forward with the price, the provider and the length, and you approve it here. No model ever decides to spend.',
      },
      {
        title: 'Mark providers up or down',
        body:
          'A provider that ignored you sinks to the bottom of the list next time. One that worked leads it. Your marks are remembered per provider.',
      },
      {
        title: 'Failures explain themselves',
        body:
          'When a session cannot open you get a sentence, not a stack trace — what happened, whether anything was staked, and the one button that fixes it.',
      },
    ],
    actions: [
      { kind: 'pin-models', label: 'Pin my models' },
      { kind: 'install-grok', label: 'Install grok' },
    ],
  },
];

/**
 * Which notes to show, given what they last saw.
 *
 * Everything newer than `lastSeen`, so a tester who skips a build still learns
 * what arrived in it. Never anything on a FIRST run: with nothing stored we
 * show only the current version's note, because a brand-new user reading three
 * releases of history learns nothing about the app they just installed.
 */
export function notesToShow(
  currentVersion: string,
  lastSeen: string | null | undefined,
  notes: ReleaseNote[] = RELEASE_NOTES,
): ReleaseNote[] {
  if (lastSeen === currentVersion) return [];
  const current = notes.find((n) => n.version === currentVersion);
  if (!lastSeen) return current ? [current] : [];

  const seenAt = notes.findIndex((n) => n.version === lastSeen);
  // An unrecognised stored version (downgrade, or a build with no note) is
  // treated like a first run rather than replaying the entire history.
  if (seenAt === -1) return current ? [current] : [];
  return notes.slice(0, seenAt);
}
