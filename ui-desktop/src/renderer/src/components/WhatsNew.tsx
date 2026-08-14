import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router';
import { IconSparkles, IconCheck } from '@tabler/icons-react';
import Modal from './contracts/modals/Modal';
import { withClient } from '../store/hocs/clientContext';
import {
  notesToShow,
  RELEASE_NOTES,
  type ReleaseNote,
} from '../../../shared/release-notes';

// ============================================================================
// "Here is what you just got."
//
// A tester who updates sees an app that looks identical: the setup wizard is
// behind them, and everything new lives on a screen they have no reason to
// open. This says so once per version, and — the part that matters — carries
// the actions with it. Reading about pinning and then having to go and find
// where to pin is how a feature stays unused.
//
// It writes "seen" only on dismissal, never on show, so a crash mid-read means
// they get another chance rather than silently losing the notice.
// ============================================================================

const Head = styled.div`
  padding: 2.4rem 2.4rem 1.2rem;
`;

const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.1rem;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.morMain};
`;

const Title = styled.h2`
  margin: 0.8rem 0 0;
  font-size: 2.1rem;
  font-weight: 600;
  line-height: 1.25;
  color: ${(p) => p.theme.colors.textPrimary};
`;

const Body = styled.div`
  padding: 0 2.4rem;
  max-height: 46vh;
  overflow-y: auto;
`;

const Item = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1.2rem 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.glassBorder};

  &:last-child {
    border-bottom: none;
  }

  svg {
    flex-shrink: 0;
    margin-top: 0.3rem;
    color: ${(p) => p.theme.colors.morMain};
  }
`;

const ItemTitle = styled.div`
  font-weight: 600;
  font-size: 1.35rem;
  color: ${(p) => p.theme.colors.textPrimary};
  margin-bottom: 0.3rem;
`;

const ItemBody = styled.div`
  font-size: 1.25rem;
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textSecondary};
`;

const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  justify-content: flex-end;
  padding: 1.6rem 2.4rem 2.2rem;
`;

const Primary = styled.button`
  all: unset;
  cursor: pointer;
  padding: 0.9rem 1.6rem;
  border-radius: 8px;
  font-size: 1.3rem;
  font-weight: 600;
  background: ${(p) => p.theme.colors.morMain};
  color: ${(p) => p.theme.colors.void};
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.brandTint(0.6)};
    outline-offset: 2px;
  }
`;

const Secondary = styled(Primary)`
  background: transparent;
  color: ${(p) => p.theme.colors.textPrimary};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

const Note = styled.div`
  width: 100%;
  font-size: 1.15rem;
  color: ${(p) => p.theme.colors.textSecondary};
  text-align: left;
`;

/**
 * Also openable on demand.
 *
 * The automatic showing depends on stored state, an IPC round trip and a
 * version match — three things that can each fail quietly, as one just did. A
 * button in Settings depends on none of them, so a tester always has a way to
 * read what changed, and support has a way to say "open this" rather than
 * "it should have appeared".
 */
export const WhatsNew = withClient(({ client, forceOpen, onClose }: any) => {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [busy, setBusy] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [grokInstalled, setGrokInstalled] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (forceOpen) {
      // Show the current release's notes regardless of what was last seen.
      void (async () => {
        try {
          const state: any = await client.getWhatsNewState();
          const current = RELEASE_NOTES.find((n) => n.version === state?.version);
          setNotes(current ? [current] : RELEASE_NOTES.slice(0, 1));
          const g: any = await client.getGrokStatus().catch(() => null);
          setGrokInstalled(g ? !!g.installed : null);
        } catch {
          setNotes(RELEASE_NOTES.slice(0, 1));
        }
      })();
      return;
    }
    let cancelled = false;
    void (async () => {
      // RETRY, and say so when it fails.
      //
      // The first version asked main once and swallowed anything that went
      // wrong — so a bridge that was not ready yet, or a main process that had
      // not finished subscribing, produced exactly the same result as "nothing
      // to show": silence. That is indistinguishable from the feature working,
      // which is how it reached a tester and did nothing.
      let state: any = null;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          state = await client.getWhatsNewState();
          if (state?.version) break;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`what's new: could not read state (try ${attempt + 1})`, e);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (cancelled || !state?.version) {
        // eslint-disable-next-line no-console
        console.warn("what's new: no version from main; not showing anything");
        return;
      }
      try {
        const due = notesToShow(state.version, state.lastSeenVersion);
        if (!due.length) return;
        setNotes(due);
        // Only to decide whether to offer the install button — an action that
        // does nothing when the tool is already there is worse than no action.
        try {
          const g: any = await client.getGrokStatus();
          if (!cancelled) setGrokInstalled(!!g?.installed);
        } catch {
          if (!cancelled) setGrokInstalled(null);
        }
      } catch {
        /* no state, no notice — never block the app on this */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!notes.length) return null;

  const dismiss = async () => {
    setNotes([]);
    onClose?.();
    try {
      await client.markWhatsNewSeen();
    } catch {
      /* it will simply be offered again next launch */
    }
  };

  const actions = notes.flatMap((n) => n.actions ?? []);
  const wants = (kind: string) => actions.some((a) => a.kind === kind);
  const labelFor = (kind: string) =>
    actions.find((a) => a.kind === kind)?.label ?? 'Open';

  return (
    <Modal onClose={() => void dismiss()} bodyProps={{ width: '620px', maxWidth: '94%' }}>
      <Head>
        <Eyebrow>
          <IconSparkles size={16} stroke={2} />
          New in {notes[0].version}
        </Eyebrow>
        <Title>{notes[0].headline}</Title>
      </Head>

      <Body>
        {notes.flatMap((n) =>
          n.items.map((item) => (
            <Item key={`${n.version}-${item.title}`}>
              <IconCheck size={18} stroke={2} />
              <div>
                <ItemTitle>{item.title}</ItemTitle>
                <ItemBody>{item.body}</ItemBody>
              </div>
            </Item>
          )),
        )}
      </Body>

      <Foot>
        {actionNote && <Note>{actionNote}</Note>}

        {/* Offered only when it would do something. */}
        {wants('install-grok') && grokInstalled === false && (
          <Secondary
            disabled={busy === 'grok'}
            onClick={async () => {
              setBusy('grok');
              setActionNote('Installing grok — this can take a minute.');
              try {
                const r: any = await client.installGrok();
                setGrokInstalled(!!r?.status?.installed);
                setActionNote(
                  r?.ok
                    ? 'grok is installed. Pin a model and it will appear in its /model picker.'
                    : 'grok could not be installed — Settings shows the installer’s output.',
                );
              } catch (e: any) {
                setActionNote(String(e?.message ?? e));
              } finally {
                setBusy('');
              }
            }}
          >
            {busy === 'grok' ? 'Installing…' : labelFor('install-grok')}
          </Secondary>
        )}

        {wants('pin-models') && (
          <Primary
            onClick={async () => {
              // Dismiss first: coming back to a modal you already read, on top
              // of the screen it sent you to, reads as a bug.
              await dismiss();
              navigate('/settings');
            }}
          >
            {labelFor('pin-models')}
          </Primary>
        )}

        <Secondary onClick={() => void dismiss()}>Got it</Secondary>
      </Foot>
    </Modal>
  );
});

export default WhatsNew;
