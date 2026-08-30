import React from 'react';

/**
 * The app had NO error boundary anywhere. React's behaviour without one is not
 * "the broken component disappears" — it unmounts the ENTIRE tree. The window
 * keeps its last painted frame, every timer is cleaned up, and the process sits
 * there alive at 0% CPU.
 *
 * That failure is indistinguishable from a hang, and it is completely silent:
 * no crash report (it is a JS throw, not a process crash), and nothing in
 * main.log, because the renderer has no global error handler either — the only
 * one installed is Raven's `unhandledrejection`, and that requires a Sentry DSN
 * the packaged app does not set.
 *
 * So: catch the throw, keep something on screen, and — the part that matters
 * more — get the error OUT of the renderer to the main log, where a bug report
 * can reach it. `ipcRenderer.send` is fire-and-forget on purpose: the reply
 * path for 'handle-client-error' is broken (its handler is the one non-async
 * handler in the table, so the dispatcher logs a warning and never replies),
 * and a boundary that awaits a reply that never comes would hang while trying
 * to report a hang.
 */
type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class RootErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    try {
      (window as any).ipcRenderer?.send?.('handle-client-error', {
        id: `render-${Date.now()}`,
        data: {
          message: `renderer render threw: ${error?.message ?? error}`,
          stack: `${error?.stack ?? ''}\n--- component stack ---${info?.componentStack ?? ''}`,
        },
      });
    } catch {
      /* reporting must never be the thing that throws */
    }
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    // Deliberately plain: no styled-components, no theme, no icons. Whatever
    // just threw may BE the theme or an icon import, and a fallback that needs
    // the broken machinery is not a fallback.
    return (
      <div
        data-testid="root-error"
        style={{
          padding: '3rem',
          fontFamily: 'system-ui, sans-serif',
          // CSS SYSTEM COLORS, not theme tokens and not hex. The theme is a
          // plausible cause of whatever just threw, so the fallback must not
          // depend on it — and hardcoded hex would be frozen in one mode (the
          // frozen-values gate catches exactly that). Canvas/CanvasText follow
          // the OS light/dark setting on their own.
          color: 'CanvasText',
          background: 'Canvas',
          minHeight: '100vh',
          lineHeight: 1.5,
        }}
      >
        <h1 style={{ fontSize: '1.6rem', marginBottom: '0.8rem' }}>
          Something broke on this screen
        </h1>
        <p style={{ opacity: 0.8, marginBottom: '1.4rem' }}>
          The app is still running. This has been written to the log. Reloading
          usually gets you moving again.
        </p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontSize: '1.1rem',
            opacity: 0.75,
            marginBottom: '1.6rem',
          }}
        >
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '0.7rem 1.4rem',
            fontSize: '1.1rem',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}

export default RootErrorBoundary;
