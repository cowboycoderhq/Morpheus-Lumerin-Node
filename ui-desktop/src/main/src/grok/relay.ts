// ============================================================================
// grok-build leader relay — the socket half.
//
// Sits between grok's TUI and grok's agent on the leader Unix socket, forwards
// everything untouched, and takes exactly one thing off the wire: a registered
// slash command such as `/start`. That command then runs OUR code, with no
// model involved in the decision to spend.
//
// THIS FILE MAKES NO NETWORK CALLS. It speaks to two Unix sockets and nothing
// else — no fetch, no http, no dns. Whatever a command does is the handler's
// business, and the handler lives in the app. That separation is deliberate:
// "the relay cannot phone anywhere" is then a property you can confirm by
// reading the imports, rather than a claim about behaviour.
//
// It also never writes to disk. A spike version of this logged one session and
// captured a live API key out of grok's own MCP config. See protocol.ts.
// ============================================================================

import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import net from 'node:net';
import {
  BLESSED_LEADER_VERSIONS,
  buildAskQuestion,
  buildPromptResult,
  classifyClientFrame,
  decodeFrames,
  isVersionBlessed,
  parsePickerAnswer,
  readLeaderVersion,
  summariseFrame,
  acpPayload,
  type LeaderFrame,
  type PickerAnswer,
  type PickerQuestion,
} from './protocol';

export type RelayState =
  | { status: 'stopped' }
  | { status: 'listening' }
  | { status: 'relaying'; leaderVersion: string }
  | { status: 'refused'; leaderVersion: string | null; reason: string }
  | { status: 'failed'; reason: string };

export type CommandInvocation = {
  command: string;
  args: string;
  sessionId: string;
  /** Raise grok's own selection dialog and wait for the user. */
  ask: (questions: PickerQuestion[]) => Promise<PickerAnswer>;
};

export type RelayDeps = {
  /** Where the real `grok agent leader` is listening. */
  realSocketPath: string;
  /** Where we listen, and what the TUI is pointed at. */
  listenSocketPath: string;
  /** Command words to take off the wire, without the leading slash. */
  commands: string[];
  /** Runs when a registered command is invoked. Its resolution ends the turn. */
  onCommand: (invocation: CommandInvocation) => Promise<void>;
  onState?: (state: RelayState) => void;
  /** Receives type/method/id summaries only — never content. */
  log?: (message: string) => void;
  blessedVersions?: readonly string[];
};

/** Well clear of the ids either side allocates from zero. */
const ORIGINATED_ID_BASE = 8_000_000;
const ASK_TIMEOUT_MS = 10 * 60_000;

export class GrokLeaderRelay {
  private server: net.Server | null = null;
  private deps: RelayDeps;
  private state: RelayState = { status: 'stopped' };
  private nextId = ORIGINATED_ID_BASE;
  private pending = new Map<number, (result: any) => void>();
  /** Live sockets, so stop() actually stops rather than orphaning them. */
  private open = new Set<net.Socket>();

  constructor(deps: RelayDeps) {
    this.deps = deps;
  }

  getState(): RelayState {
    return this.state;
  }

  isRunning(): boolean {
    return !!this.server?.listening;
  }

  private setState(state: RelayState): void {
    this.state = state;
    this.deps.onState?.(state);
  }

  async start(): Promise<void> {
    await this.stop();
    const path = this.deps.listenSocketPath;
    // A leftover socket file from a crash makes bind fail with EADDRINUSE even
    // though nothing is listening.
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        /* bind will report it properly */
      }
    }

    const server = net.createServer((client) => this.onClient(client));
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      server.once('error', (e) => {
        this.setState({ status: 'failed', reason: String(e) });
        reject(e);
      });
      server.listen(path, () => {
        try {
          // Unix socket permissions are enforced on macOS and Linux: without
          // this any local user could drive the TUI's agent connection.
          chmodSync(path, 0o600);
        } catch {
          /* best effort; the socket lives in our own dir */
        }
        this.setState({ status: 'listening' });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    // Any dialog still waiting resolves as cancelled rather than hanging its
    // handler forever.
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
    // Closing the listener does NOT close established connections: without
    // this, a stopped relay keeps carrying traffic and its upstream sockets
    // hold the agent open.
    for (const sock of this.open) sock.destroy();
    this.open.clear();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (existsSync(this.deps.listenSocketPath)) {
      try {
        unlinkSync(this.deps.listenSocketPath);
      } catch {
        /* nothing further to do */
      }
    }
    this.setState({ status: 'stopped' });
  }

  private onClient(client: net.Socket): void {
    const upstream = net.connect(this.deps.realSocketPath);
    this.open.add(client);
    this.open.add(upstream);
    let clientBuf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let upstreamBuf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let blessed = false;
    let closed = false;

    const shutdown = (reason: string): void => {
      if (closed) return;
      closed = true;
      this.deps.log?.(`relay: connection closed (${reason})`);
      this.open.delete(client);
      this.open.delete(upstream);
      client.destroy();
      upstream.destroy();
    };

    // ---- client -> agent ---------------------------------------------------
    // Parsed BEFORE forwarding, because forwarding is the thing we sometimes
    // decline to do. Frames are re-emitted as their original bytes.
    client.on('data', (chunk) => {
      clientBuf = Buffer.concat([clientBuf, chunk]);
      const { frames, rest, error } = decodeFrames(clientBuf);
      clientBuf = rest;
      if (error) {
        shutdown(`client stream desynced: ${error}`);
        return;
      }
      for (const frame of frames) {
        this.deps.log?.(summariseFrame('C->A', frame));
        // An answer to a dialog WE raised. The agent never saw the question, so
        // it must never see the answer either.
        if (this.takeOriginatedReply(frame)) continue;
        const verdict = classifyClientFrame(frame, this.deps.commands);
        if (verdict.action === 'forward') {
          upstream.write(frame.raw);
          continue;
        }
        // Taken off the wire: the agent never sees it, so no model does.
        this.deps.log?.(`relay: intercepted /${verdict.command}`);
        void this.runCommand(client, verdict.command, verdict.args, verdict.sessionId, verdict.requestId);
      }
    });

    // ---- agent -> client ---------------------------------------------------
    upstream.on('data', (chunk) => {
      upstreamBuf = Buffer.concat([upstreamBuf, chunk]);
      const { frames, rest, error } = decodeFrames(upstreamBuf);
      upstreamBuf = rest;
      if (error) {
        shutdown(`agent stream desynced: ${error}`);
        return;
      }
      for (const frame of frames) {
        // The version gate, on the handshake and before anything else moves.
        const version = readLeaderVersion(frame);
        if (version !== null) {
          if (!isVersionBlessed(version, this.deps.blessedVersions ?? BLESSED_LEADER_VERSIONS)) {
            this.setState({
              status: 'refused',
              leaderVersion: version,
              reason: `grok ${version} has not been checked against this relay. Session opening from the terminal is off until it is.`,
            });
            shutdown('unblessed leader version');
            return;
          }
          blessed = true;
          this.setState({ status: 'relaying', leaderVersion: version });
        }
        client.write(frame.raw);
      }
    });

    const bye = (who: string) => () => shutdown(who);
    client.on('error', bye('client error'));
    upstream.on('error', bye('agent error'));
    client.on('close', bye('client closed'));
    upstream.on('close', bye('agent closed'));

    // Nothing may be intercepted before the handshake has been vetted.
    upstream.on('connect', () => {
      if (!blessed) this.deps.log?.('relay: connected upstream, awaiting handshake');
    });
  }

  /** Consume a response to a request this relay originated. */
  private takeOriginatedReply(frame: LeaderFrame): boolean {
    const inner = acpPayload(frame);
    if (!inner || typeof inner.id !== 'number' || inner.id < ORIGINATED_ID_BASE) {
      return false;
    }
    const resolve = this.pending.get(inner.id);
    if (!resolve) return false;
    this.pending.delete(inner.id);
    if (inner.error !== undefined) {
      // A REJECTED dialog is not a cancelled one. Treating the two alike hides
      // a broken integration behind "the user changed their mind" — say so.
      // This describes OUR OWN request, so it carries no user content.
      const code = inner.error?.code;
      const msg = String(inner.error?.message ?? '').slice(0, 200);
      this.deps.log?.(`relay: the client REJECTED our dialog (code=${code}) ${msg}`);
      resolve(null);
      return true;
    }
    resolve(inner.result);
    return true;
  }

  private async runCommand(
    client: net.Socket,
    command: string,
    args: string,
    sessionId: string,
    requestId: string | number,
  ): Promise<void> {
    const ask = (questions: PickerQuestion[]): Promise<PickerAnswer> =>
      new Promise((resolve) => {
        const id = this.nextId++;
        let settled = false;
        const done = (answer: PickerAnswer) => {
          if (settled) return;
          settled = true;
          this.pending.delete(id);
          resolve(answer);
        };
        // A picker with no answer must not wedge the turn forever.
        const timer = setTimeout(() => done({ outcome: 'cancelled' }), ASK_TIMEOUT_MS);
        if (typeof (timer as any).unref === 'function') (timer as any).unref();
        this.pending.set(id, (result) => {
          clearTimeout(timer);
          done(parsePickerAnswer(result));
        });
        client.write(
          buildAskQuestion({
            requestId: id,
            sessionId,
            toolCallId: `morpheus-${command}-${id}`,
            questions,
          }),
        );
      });

    try {
      await this.deps.onCommand({ command, args, sessionId, ask });
    } catch (e: any) {
      // The handler failing must still end the turn — the TUI is holding a
      // request open, and a hung prompt looks like a frozen app.
      this.deps.log?.(`relay: /${command} handler failed: ${e?.message ?? e}`);
    } finally {
      try {
        client.write(buildPromptResult(requestId));
      } catch {
        /* the client went away; nothing to complete */
      }
    }
  }
}
