// ============================================================================
// Bringing this app's window forward.
//
// Lived in the grok supervisor, which was where the first caller happened to
// be. It is not a grok concept: the session offer raised by the OpenAI-
// compatible endpoint needs it too, and that path outlived the relay.
// ============================================================================

import { app, BrowserWindow } from 'electron';

/**
 * Show and focus the main window, returning it — or null when there is none.
 *
 * Callers need the window back because a request they are answering may have to
 * be settled differently when no window exists; returning null rather than
 * throwing keeps that a decision rather than an exception.
 */
export function bringAppToFront(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0] ?? null;
  if (!win) return null;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  try {
    app.focus({ steal: true });
  } catch {
    /* not fatal — the window is already shown */
  }
  return win;
}

/**
 * Where grok's binary is, if it is installed at all.
 *
 * A GUI app does not inherit the user's shell PATH, so this probes the places
 * grok's own installer uses. It is all that survives of the supervisor: the
 * live features only ever asked it "is grok there, and where".
 */
export function detectGrokPath(): string | undefined {
  // Imported lazily so this module stays cheap for callers that only want the
  // window, and so the fs/os dependency does not travel with it.
  const fs = require('node:fs') as typeof import('node:fs');
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  for (const candidate of [
    path.join(os.homedir(), '.grok', 'bin', 'grok'),
    '/opt/homebrew/bin/grok',
    '/usr/local/bin/grok',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}
