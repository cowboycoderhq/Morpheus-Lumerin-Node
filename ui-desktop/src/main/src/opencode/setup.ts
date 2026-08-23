// ============================================================================
// opencode integration — detection, configuration, and launch.
//
// The app can hand a live Morpheus session straight to `opencode`: it publishes
// its own opencode config describing a `morpheus` provider pointed at the local
// OpenAI-compatible endpoint, then launches opencode with that model selected.
//
// THE CONFIG IS OURS, NOT THEIRS.
// opencode reads `OPENCODE_CONFIG` as an extra config file, loaded between the
// global and project configs, and MERGES rather than replaces. So this writes a
// file the app owns and sets that variable at launch. The user's
// `~/.config/opencode/opencode.jsonc` is never read, never parsed and never
// rewritten — which matters, because that file is where people keep their own
// providers and it is JSONC: any round-trip through JSON.parse/stringify would
// silently delete their comments. Owning a separate file removes the whole class
// of problem instead of managing it.
// ============================================================================

import { execFile } from 'child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

export type OpencodeStatus = {
  installed: boolean;
  version?: string;
  path?: string;
};

/** Where Homebrew and the official installer put it, plus whatever is on PATH. */
const CANDIDATE_PATHS = [
  '/opt/homebrew/bin/opencode',
  '/usr/local/bin/opencode',
];

export async function detectOpencode(): Promise<OpencodeStatus> {
  const tryPath = async (bin: string): Promise<OpencodeStatus | null> => {
    try {
      const { stdout } = await run(bin, ['--version'], { timeout: 5000 });
      const version = stdout.trim().split('\n')[0];
      return { installed: true, version, path: bin };
    } catch {
      return null;
    }
  };

  // A GUI app does not inherit the user's shell PATH, so `opencode` alone often
  // fails even when it is installed. Probe the known locations first.
  for (const candidate of CANDIDATE_PATHS) {
    const found = await tryPath(candidate);
    if (found) return found;
  }
  const onPath = await tryPath('opencode');
  return onPath ?? { installed: false };
}

/**
 * The command shown to the user before anything runs.
 *
 * Displayed verbatim in the UI: an app that downloads and executes an installer
 * should be able to say exactly what it is about to do.
 */
export function installCommand(): { display: string; file: string; args: string[] } {
  return {
    display: 'brew install sst/tap/opencode',
    file: '/bin/bash',
    args: ['-lc', 'brew install sst/tap/opencode'],
  };
}

export type MorpheusProviderInput = {
  baseUrl: string;
  apiKey: string;
  /** Advertised model ids — must match what GET /v1/models returns. */
  models: { id: string; label: string }[];
  /**
   * Absolute path to the `/start` plugin, if it is being shipped.
   *
   * Passed as opencode's `["<path>", options]` plugin tuple so the endpoint URL
   * and bearer token reach the plugin as DATA rather than being written into
   * its source. The plugin file is then identical for every user and carries no
   * secret, which also means rewriting it can never leak one.
   */
  pluginPath?: string;
};

/**
 * The opencode config describing this app as a provider.
 *
 * `npm: "@ai-sdk/openai-compatible"` is opencode's generic adapter for any
 * OpenAI-shaped endpoint. Model keys must match the ids from `/v1/models`
 * exactly, which is why the facade advertises stable, resolvable names.
 */
export function buildMorpheusConfig(input: MorpheusProviderInput): string {
  const models: Record<string, { name: string }> = {};
  for (const m of input.models) {
    models[m.id] = { name: m.label };
  }
  const config: Record<string, unknown> = {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      morpheus: {
        npm: '@ai-sdk/openai-compatible',
        name: 'Morpheus',
        options: {
          baseURL: input.baseUrl,
          apiKey: input.apiKey,
        },
        models,
      },
    },
  };

  if (input.pluginPath) {
    // The endpoint's ORIGIN, not its /v1 path: the plugin talks to
    // /morpheus/v1/*, which is a different namespace from the OpenAI surface.
    // Deriving it here rather than passing a second URL keeps one source of
    // truth for where the app is listening.
    config.plugin = [
      [
        input.pluginPath,
        {
          baseUrl: input.baseUrl.replace(/\/v1\/?$/, ''),
          apiKey: input.apiKey,
        },
      ],
    ];
  }

  return JSON.stringify(config, null, 2);
}

/**
 * Write the `/start` plugin beside the config.
 *
 * Rewritten on every launch so a user can never be left running a stale copy
 * against a changed endpoint. 0600 for consistency with the config, though the
 * plugin itself deliberately holds no secret — the token reaches it through the
 * config's plugin options.
 */
export function writeStartPlugin(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, { encoding: 'utf8', mode: 0o600 });
  // `mode` applies only on creation; set it on every write (see below).
  chmodSync(path, 0o600);
}

/**
 * The endpoint descriptor both generated plugins read.
 *
 * Auto-loaded plugins get no options, so this file is how the URL, key and
 * model list reach them. It is the ONE artifact of this integration that holds
 * a credential — hence 0600 on every write, not just on creation.
 */
export function writeEndpointDescriptor(
  path: string,
  descriptor: {
    baseUrl: string;
    apiKey: string;
    models: { id: string; label: string }[];
  },
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(descriptor, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

export function writeMorpheusConfig(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  // 0600: the file carries the endpoint's bearer token.
  writeFileSync(path, contents, { encoding: 'utf8', mode: 0o600 });
  // `mode` only applies when the file is CREATED. An existing file keeps
  // whatever permissions it had — so a copy that predates this (or one a user
  // recreated by hand) would keep 0644 and leave the token world-readable
  // forever. Set it explicitly on every write.
  chmodSync(path, 0o600);
}

/**
 * Single-quote a value for POSIX sh.
 *
 * Model ids reach this from the chain — they are attacker-influenceable in
 * principle (anyone can register a model with any name), and they end up in a
 * shell command. Wrapping in single quotes and escaping embedded single quotes
 * is the only form that is safe for arbitrary content.
 */
export function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export type LaunchInput = {
  opencodePath: string;
  configPath: string;
  /** Omitted → launch with no model preselected, so `/start` can choose one. */
  modelId?: string;
  cwd: string;
};

/**
 * The exact shell line the terminal will run.
 *
 * Kept pure and exported so it can be shown to the user and asserted in tests —
 * a command that spawns a terminal is not something to assemble by feel.
 */
export function buildLaunchScript(input: LaunchInput): string {
  // Refuse control characters outright rather than quoting around them.
  //
  // Single quotes DO make a newline safe — it stays inside the argument — but a
  // multi-line token in a generated .command file is unreadable, impossible to
  // review by eye, and one careless refactor away from being a second command.
  // No model id, path or directory has a legitimate reason to contain one, so
  // this fails closed instead of relying on quoting to stay perfect forever.
  for (const [field, value] of Object.entries(input)) {
    // An absent modelId is legitimate; only inspect what is actually there.
    if (value === undefined) {
      continue;
    }
    if (/[\u0000-\u001f\u007f]/.test(String(value))) {
      throw new Error(
        `Refusing to build a launch command: ${field} contains a control character.`,
      );
    }
  }

  // No model asked for -> no -m flag. opencode then opens with the Morpheus
  // provider configured and nothing preselected, which is the state `/start`
  // expects to be run from.
  const launch = input.modelId
    ? `exec ${shellQuote(input.opencodePath)} -m ${shellQuote(`morpheus/${input.modelId}`)}`
    : `exec ${shellQuote(input.opencodePath)}`;
  return [
    '#!/bin/bash',
    `cd ${shellQuote(input.cwd)} || exit 1`,
    `export OPENCODE_CONFIG=${shellQuote(input.configPath)}`,
    launch,
    '',
  ].join('\n');
}

/**
 * Open a terminal running opencode against the given model.
 *
 * A `.command` file opened with `open` is used rather than osascript-ing
 * Terminal.app directly, because `.command` respects whichever terminal the user
 * has set as the handler (iTerm, Ghostty, …) instead of forcing Apple's.
 */
export async function launchInTerminal(
  scriptPath: string,
  script: string,
): Promise<void> {
  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, script, { encoding: 'utf8', mode: 0o700 });
  await run('/usr/bin/open', [scriptPath]);
}
