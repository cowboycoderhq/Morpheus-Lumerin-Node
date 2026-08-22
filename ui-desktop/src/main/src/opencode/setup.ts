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
import { mkdirSync, writeFileSync } from 'fs';
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
  return JSON.stringify(
    {
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
    },
    null,
    2,
  );
}

export function writeMorpheusConfig(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  // 0600: the file carries the endpoint's bearer token.
  writeFileSync(path, contents, { encoding: 'utf8', mode: 0o600 });
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
  modelId: string;
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
    if (/[\u0000-\u001f\u007f]/.test(String(value))) {
      throw new Error(
        `Refusing to build a launch command: ${field} contains a control character.`,
      );
    }
  }

  const model = `morpheus/${input.modelId}`;
  return [
    '#!/bin/bash',
    `cd ${shellQuote(input.cwd)} || exit 1`,
    `export OPENCODE_CONFIG=${shellQuote(input.configPath)}`,
    `exec ${shellQuote(input.opencodePath)} -m ${shellQuote(model)}`,
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
