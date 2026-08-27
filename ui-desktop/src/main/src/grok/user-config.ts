// ============================================================================
// Turning off grok's managed-config sync, in the user's own config.
//
// grok owns `$GROK_HOME/managed_config.toml`: a background task asks xAI what
// managed configuration this account should have, is told "none", and deletes
// the artifact the server no longer serves. Ours is that artifact. Measured at
// roughly every two minutes, and it caught a real user mid-test — a freshly
// started grok found no Morpheus models at all, which is indistinguishable from
// the integration being broken.
//
// A watcher puts the file back in milliseconds, but that is a race we win
// rather than a race that stopped happening. The cure is the switch grok
// documents for exactly this: `[features] managed_config`.
//
// THAT SWITCH LIVES IN THE USER'S OWN config.toml, which this integration has
// otherwise never touched — deliberately, because not touching it is what makes
// installing us safe. So the write is constrained hard:
//
//   - ADDITIVE ONLY. One key. Everything else is copied through byte for byte,
//     including comments, ordering and formatting.
//   - NEVER OVERRIDES A CHOICE. If the key is already there — whatever its
//     value — we leave it and say so. A user who set it deliberately outranks
//     us, even when their choice breaks us.
//   - IDEMPOTENT. Running it every launch must change the file at most once.
//   - REVERSIBLE. The previous file is kept beside it before anything is
//     written.
// ============================================================================

export type GrokConfigPatch = {
  /** The file to write, or null when nothing should be written. */
  toml: string | null;
  /** What happened, for the log and for Settings. Never a silent no-op. */
  outcome:
    | 'added'
    | 'already-disabled'
    | 'left-enabled-by-user'
    | 'unparseable';
  note: string;
};

const SETTING = 'managed_config';

/**
 * Does a `[features]` table already decide this?
 *
 * Deliberately crude and deliberately conservative: it looks for the key inside
 * the `[features]` table only, and any sighting at all — true, false, commented
 * back in later — counts as "the user has an opinion". Being wrong in this
 * direction costs us a workaround; being wrong the other way rewrites a setting
 * somebody chose.
 */
function findSetting(toml: string): { present: boolean; value?: string } {
  const lines = toml.split(/\r?\n/);
  let inFeatures = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[[^\]]+\]$/.test(line)) {
      inFeatures = line === '[features]';
      continue;
    }
    if (!inFeatures) continue;
    const m = new RegExp(`^${SETTING}\\s*=\\s*(\\S+)`).exec(line);
    if (m) return { present: true, value: m[1] };
  }
  return { present: false };
}

/**
 * Produce the file to write, given the file that is there.
 *
 * Pure, so the interesting cases — no file, a `[features]` table with other
 * settings in it, the key already set either way, a file that is not TOML at
 * all — are all testable without touching anyone's home directory.
 */
export function patchGrokUserConfig(existing: string | null): GrokConfigPatch {
  const current = existing ?? '';

  // A file we cannot make sense of is left completely alone. Appending to
  // something that is not TOML would break the user's grok, and a broken grok
  // is a far worse outcome than a model list that occasionally vanishes.
  if (current.trim() && !/^\s*(#|\[|[A-Za-z_][\w-]*\s*=)/m.test(current)) {
    return {
      toml: null,
      outcome: 'unparseable',
      note: 'Your ~/.grok/config.toml is not in a form this app recognises, so it was left untouched.',
    };
  }

  const found = findSetting(current);
  if (found.present) {
    const disabled = /^false$/i.test(found.value ?? '');
    return {
      toml: null,
      outcome: disabled ? 'already-disabled' : 'left-enabled-by-user',
      note: disabled
        ? 'grok’s managed-config sync is already turned off in your config.'
        : `Your config sets ${SETTING} = ${found.value}, so it was left as you had it. ` +
          'While that sync is on, grok deletes this app’s model list every couple of minutes; ' +
          'the app puts it back, but a grok started in that gap will not see your models.',
    };
  }

  const why = [
    '# Added by the Morpheus desktop app.',
    '#',
    '# grok syncs managed configuration from xAI and deletes any managed file the',
    '# server does not know about — including the model list this app publishes',
    '# for you, roughly every two minutes. Turning the sync off keeps that list',
    '# in place. Delete this setting to restore grok’s default.',
  ];

  const lines = current.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.trim() === '[features]');

  // A SECOND [features] table would be a duplicate table definition, which TOML
  // forbids outright — grok would fail to parse its own config and the user
  // would have a broken terminal, which is far worse than the problem being
  // solved. So an existing table is written INTO, and only a file without one
  // gets a new table appended.
  if (headerAt !== -1) {
    const patched = [
      ...lines.slice(0, headerAt + 1),
      ...why.map((c) => c),
      `${SETTING} = false`,
      ...lines.slice(headerAt + 1),
    ];
    return {
      toml: patched.join('\n'),
      outcome: 'added',
      note: 'Turned off grok’s managed-config sync so your Morpheus models stay in its model list.',
    };
  }

  const body = current.replace(/\s*$/, '');
  const block = ['', ...why, '[features]', `${SETTING} = false`, ''].join('\n');
  return {
    toml: `${body}${body ? '\n' : ''}${block}`,
    outcome: 'added',
    note: 'Turned off grok’s managed-config sync so your Morpheus models stay in its model list.',
  };
}
