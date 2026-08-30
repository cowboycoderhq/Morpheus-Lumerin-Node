// ============================================================================
// Setup Wizard — self-healing controller.
//
// Drives silent, bounded auto-retry off the existing `services-state` feed
// and the existing `restartService` / `startServices` client methods (no new
// IPC, no new backend behavior). Only after auto-retry is exhausted for a
// given key does it hand back an escalation for the UI to render as ONE
// plain-language remediation card.
//
// `containerRuntime` is intentionally not a healable key here — see the note
// in phases.ts. This hook only ever touches the four keys below.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Client } from '@renderer/client';
import type { LoadingState } from 'src/main/orchestrator/orchestrator.types';

// IPFS is deliberately NOT a heal key: it is optional (provider-only feature,
// commonly-taken default port) and must never block or escalate the wizard —
// gating on it froze the app on a port conflict. It starts best-effort in the
// background and is surfaced only at the point of use (the provider hub).
export type HealKey = 'downloads' | 'aiRuntime' | 'proxyRouter';

export type EscalationKind = 'storage' | 'network' | 'generic';

export type EscalationInfo = {
  key: HealKey;
  kind: EscalationKind;
  message?: string;
  // The service's own last words. The orchestrator has always captured the
  // child's stdout/stderr (StartupItem.stderrOutput) and shipped it here with
  // every state tick; until now the UI dropped it on the floor and showed
  // "Something needs a quick fix" instead, which is unactionable for the user
  // AND for us — a remote failure we cannot see is a failure we cannot fix.
  stderr?: string;
};

const HEAL_KEYS: HealKey[] = ['downloads', 'aiRuntime', 'proxyRouter'];

// Bounded backoff — 3 auto-attempts per service, increasing delay.
const BACKOFF_MS = [2000, 5000, 10000];
const MAX_ATTEMPTS = BACKOFF_MS.length;

type KeyState = {
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
  // When this key was first seen not-healthy. Backstop for the black hole below.
  unhealthySince: number | null;
};

const freshKeyState = (): KeyState => ({
  attempts: 0,
  timer: null,
  unhealthySince: null,
});

// THE BLACK HOLE. A service wedged in 'starting' reports `working` forever: no
// retry is scheduled, no escalation fires, and the wizard spins with no error
// and no button.
//
// The ceiling is measured ONLY from when a service actually enters 'starting' —
// NOT from wizard mount, and NOT during downloads. The first version made both
// of those mistakes: it started the clock the first tick a key was non-healthy
// (which is mount, with downloads still running) and included the 'downloads'
// key, so a ~1GB model download on a thin home connection would trip a scary
// "it simply never came up" card mid-download. That is precisely the
// slow-connection user the wizard exists to serve.
//
// 'pending' does not run the clock either: a service is 'pending' only because
// the pipeline hasn't reached it yet (downloads ahead of it), which is normal.
// A truly stuck 'starting' resolves via its own probe budget (300s) to
// 'stopped' → the ordinary attempts→escalation path; this ceiling is the
// backstop for the pathological case where 'starting' never resolves at all,
// set safely above that 300s probe.
const STUCK_MS = 6 * 60 * 1000;

// A stuck service emits NO state changes — so the `services`-driven effect never
// re-runs and the ceiling above would never be checked. This heartbeat is what
// makes the timeout real rather than decorative.
const HEARTBEAT_MS = 5000;

// NOTHING IS MOVING — the case every per-key rule above misses.
//
// The stuck-clock only runs while a service is actively 'starting'. A service
// stuck in 'pending' (the pipeline never reached it) or a download that stalls
// without erroring both read as 'working' with the clock reset on every tick,
// so no escalation can ever fire. That is a spinner forever, which is exactly
// what a tester saw: "Connecting to the Morpheus network — just a moment,
// sorting something out…", indefinitely, with no error and nothing to click.
//
// This watchdog does not care WHY. If the whole picture — every status, every
// download's progress — is byte-identical for this long, setup is not
// progressing and the user is owed the truth and a button.
// 4 minutes.
//
// This was 3, which sat BELOW proxy-router's real cold start (~3m35s, measured
// twice), so the watchdog cried stall ~35s before success on every healthy
// launch. It went to 8 as a blind backstop while the detector could not tell
// working from wedged.
//
// The detector can tell now: startup entries carry probeAttempts, so a service
// that is polling moves the fingerprint every second and CANNOT trip this
// timer no matter how slow it is. The number therefore stops being a race
// against startup time and becomes what it always should have been — how long
// a genuinely frozen pipeline may sit there before we say so.
//
// SUPERSEDED REASONING BELOW (kept because the 8 was deliberate, not a guess):
//
// 3 minutes was chosen without measuring the thing it watches. proxy-router's
// real cold start on a clean install is ~3m35s (measured twice: 3m34s, 3m35s),
// so the watchdog fired ~35 seconds before success on EVERY healthy launch and
// told the user setup had stopped while it was still working.
//
// A stall threshold set below the p100 of its own subject is not a watchdog,
// it is a false-alarm generator — and a false alarm on the setup screen is
// expensive, because the person seeing it has no way to tell it from a real
// failure and reasonably force-quits a working install.
//
// This is a BACKSTOP, deliberately loose. The right primary signal is progress
// (see progressFingerprint): startup entries currently contribute only
// [id, status, error], so a service that is genuinely coming up is
// byte-identical tick to tick. Plumbing a probe-attempt counter through
// StartupItem is the real fix and is tracked separately; until then this
// number only needs to sit above any legitimate startup, not to be precise.
const STALL_MS = 4 * 60 * 1000;

/**
 * A fingerprint of everything that would change if anything were happening.
 *
 * Downloads are included by BYTES, not just status: a download that is moving
 * slowly must not look identical to one that has stopped, or a thin connection
 * would be told setup had stalled.
 */
export const progressFingerprint = (services: LoadingState): string =>
  JSON.stringify({
    // By ATTEMPTS, not just status — the same rule the download arm has always
    // followed, finally applied to the arm that needed it. `status` sits at
    // 'starting' from a service's first probe to its last, so on status alone a
    // service that is coming up is byte-identical to one that is wedged. The
    // probe counter is the only field here that moves while it works.
    startup: services.startup.map((s) => [
      s.id,
      s.status,
      s.error ?? '',
      s.probeAttempts ?? 0,
    ]),
    // By PROGRESS, not just status: a download inching along on a thin
    // connection must not look identical to one that has stopped dead.
    download: services.download.map((d) => [d.name, d.status, d.progress]),
  });

// THREE states, not two. This used to be a boolean `failing`, and the missing
// third state made the whole escalation path dead code:
//
//   a retry goes  stopped -> pending -> starting -> stopped
//
// and the two middle ticks are not "failing". With a boolean, they counted as
// HEALTHY, which reset `attempts` to 0 on every single retry cycle — so the
// counter could never reach MAX_ATTEMPTS, the escalation never fired, and a
// permanently-broken service showed "sorting something out…" forever, with no
// error, no exit code, and no reachable "Try again" button. Silent infinite
// retry is the worst of both worlds: it looks like progress and it never ends.
//
// `working` now means exactly that: in flight, tells us nothing, change nothing.
type Health = 'healthy' | 'failing' | 'working';

const inspect = (
  services: LoadingState,
  key: HealKey,
): {
  health: Health;
  errorText?: string;
  stderr?: string;
  // Whether the orchestrator has ACTUALLY begun starting this service (status
  // 'starting'). The stuck-clock may only run in this window — see below.
  isStarting?: boolean;
} => {
  if (key === 'downloads') {
    const failed = services.download.find((d) => d.status === 'error');
    if (failed) return { health: 'failing', errorText: failed.error };
    const allDone = services.download.every((d) => d.status === 'success');
    return { health: allDone ? 'healthy' : 'working' };
  }

  const item = services.startup.find((s) => s.id === key);
  if (!item) return { health: 'working' };
  if (item.status === 'stopped') {
    return {
      health: 'failing',
      errorText: item.error,
      stderr: item.stderrOutput,
    };
  }
  if (item.status === 'running') return { health: 'healthy' };
  return { health: 'working', isStarting: item.status === 'starting' }; // pending | starting
};

// The services now report why they failed rather than just that they did, so
// we can tell "you're offline" apart from "it broke". Note that a bare
// ECONNREFUSED on localhost is deliberately NOT network: it only means the
// service isn't listening yet, and calling a crashed binary "no internet" would
// just be a different wrong answer.
// These must be SPECIFIC. The bare tokens 'network', 'download' and 'fetch'
// used to be in this list, and they matched far too much: the probe reports
// failures as "fetch failed", so a llama-server that CRASHED got classified as
// offline and the user was told "check your connection". Telling someone their
// internet is down when their AI runtime segfaulted is not a smaller error than
// saying nothing — it sends them to fix the wrong thing.
const OFFLINE = [
  'cannot connect to ethereum node', // proxy-router's own words when the chain is unreachable
  'enotfound',
  'eai_again',
  'ehostunreach',
  'enetunreach',
  'etimedout',
  'econnreset',
  'no such host',
  'network is unreachable',
  'dns',
  'failed to download',
];

const classify = (text?: string): EscalationKind => {
  const t = (text || '').toLowerCase();
  if (/space|enospc/.test(t)) return 'storage';
  if (OFFLINE.some((sig) => t.includes(sig))) return 'network';
  return 'generic';
};

/**
 * Self-heal controller. Returns:
 * - `healingKeys`: keys currently mid auto-retry (for a calm "sorting
 *   something out" indicator — never a raw error).
 * - `escalation`: set once a key has exhausted its 3 auto-attempts and is
 *   still failing — the ONE thing the UI is allowed to show the user.
 * - `retryNow()`: manual escape hatch for the escalation card's "Try again"
 *   — resets all backoff state and re-kicks the whole pipeline.
 */
export function useSelfHeal(services: LoadingState, client: Client) {
  const stateRef = useRef<Record<HealKey, KeyState>>({
    downloads: freshKeyState(),
    aiRuntime: freshKeyState(),
    proxyRouter: freshKeyState(),
  });

  const [healingKeys, setHealingKeys] = useState<ReadonlySet<HealKey>>(
    new Set(),
  );
  const [escalation, setEscalation] = useState<EscalationInfo | null>(null);
  const [beat, setBeat] = useState(0);
  const stallRef = useRef<{ print: string; since: number }>({
    print: '',
    since: Date.now(),
  });

  // Re-evaluate on a clock, not only on service state changes — a stuck service
  // is defined by the absence of state changes.
  useEffect(() => {
    const id = setInterval(() => setBeat((b) => b + 1), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  const heal = (key: HealKey) =>
    key === 'downloads'
      ? client.startServices({})
      : client.restartService({ service: key });

  useEffect(() => {
    let healingChanged = false;
    const nextHealing = new Set(healingKeys);
    let nextEscalation: EscalationInfo | null = escalation;
    const now = Date.now();

    HEAL_KEYS.forEach((key) => {
      const st = stateRef.current[key];
      const { health, errorText, stderr, isStarting } = inspect(services, key);

      // Genuinely up: only NOW is it safe to forget the failure history.
      if (health === 'healthy') {
        if (st.timer) clearTimeout(st.timer);
        stateRef.current[key] = freshKeyState();
        if (nextHealing.has(key)) {
          nextHealing.delete(key);
          healingChanged = true;
        }
        if (nextEscalation?.key === key) nextEscalation = null;
        return;
      }

      // Mid-restart. Carries no information either way — critically, do NOT
      // reset the attempt counter here (that was the bug), and do not schedule
      // another attempt on top of the one already in flight.
      if (health === 'working') {
        // The stuck-clock runs ONLY while the service is actively 'starting'.
        // 'pending' (not yet reached — downloads still ahead of it) and every
        // download tick reset it, so a slow first install is never mislabelled
        // as wedged.
        if (!isStarting) {
          st.unhealthySince = null;
          return;
        }
        if (st.unhealthySince === null) st.unhealthySince = now;

        // Wedged in 'starting' past any legitimate cold-start. Escalate with
        // what little we know rather than spinning forever.
        if (now - st.unhealthySince > STUCK_MS && !nextEscalation) {
          nextEscalation = {
            key,
            kind: 'generic',
            message:
              `${key} never finished starting (still "starting" after ${Math.round(
                (now - st.unhealthySince) / 60000,
              )} min). It reported no error — it simply never came up.`,
            stderr,
          };
        }
        return;
      }

      // Already exhausted — this is the one case the UI is told about.
      if (st.attempts >= MAX_ATTEMPTS) {
        if (!nextEscalation) {
          nextEscalation = {
            key,
            kind: classify(errorText),
            // Never show the user an empty reason. "It failed and reported
            // nothing" is itself information, and saying so beats a blank.
            message:
              errorText ??
              `${key} failed to start after ${MAX_ATTEMPTS} attempts and reported no error message.`,
            stderr,
          };
        }
        return;
      }

      // A retry is already scheduled/in-flight for this key.
      if (st.timer) return;

      // Schedule the next bounded auto-attempt.
      if (!nextHealing.has(key)) {
        nextHealing.add(key);
        healingChanged = true;
      }
      const delay = BACKOFF_MS[st.attempts];
      st.timer = setTimeout(() => {
        st.timer = null;
        st.attempts += 1;
        heal(key).catch(() => {
          // Swallowed — the next services-state tick (or attempt exhaustion)
          // is what drives the UI, not this promise rejection.
        });
      }, delay);
    });

    // The catch-all. Checked after the per-key rules so a specific diagnosis
    // always wins over "nothing is happening".
    const print = progressFingerprint(services);
    if (print !== stallRef.current.print) {
      stallRef.current = { print, since: now };
    } else if (!nextEscalation && now - stallRef.current.since > STALL_MS) {
      const stuck = services.startup.find((s) => s.status !== 'running');
      nextEscalation = {
        key: (stuck?.id as HealKey) ?? 'proxyRouter',
        kind: 'generic',
        message:
          `Setup stopped making progress ${Math.round(
            (now - stallRef.current.since) / 60000,
          )} minutes ago` +
          (stuck ? `, waiting on ${stuck.id} (${stuck.status}).` : '.') +
          ' Nothing reported an error — it simply stopped moving.',
        stderr: (stuck as any)?.stderrOutput,
      };
    }

    if (healingChanged) setHealingKeys(nextHealing);
    if (nextEscalation !== escalation) setEscalation(nextEscalation);
    // `beat` is load-bearing: without it this effect only re-runs when the
    // services state CHANGES, and a wedged service is precisely one that never
    // changes — so the STUCK_MS ceiling would never be evaluated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, beat]);

  useEffect(
    () => () => {
      Object.values(stateRef.current).forEach(
        (st) => st.timer && clearTimeout(st.timer),
      );
    },
    [],
  );

  const retryNow = () => {
    HEAL_KEYS.forEach((key) => {
      const st = stateRef.current[key];
      if (st.timer) clearTimeout(st.timer);
      stateRef.current[key] = freshKeyState();
    });
    setHealingKeys(new Set());
    setEscalation(null);
    client.startServices({}).catch(() => {});
  };

  return { healingKeys, escalation, retryNow };
}
