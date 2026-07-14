// ============================================================================
// Setup Wizard — the ONE remediation card the user ever sees.
//
// Only rendered once auto-retry has been exhausted (see useSelfHeal.ts). Copy
// is honest: we never claim to have fixed something we didn't, and the
// actions here are real (they call the same client methods the rest of the
// app uses) — no theater.
// ============================================================================

import { useState } from 'react';
import styled from 'styled-components';
import { motion, useReducedMotion } from 'framer-motion';
import {
  IconDatabase,
  IconWifiOff,
  IconTool,
  IconExternalLink,
  IconCopy,
  IconCheck,
} from '@tabler/icons-react';
import { Btn, Flex } from '@renderer/components/common';
import type { EscalationInfo } from './useSelfHeal';

const Card = styled(Flex.Column)`
  width: 100%;
  max-width: 44rem;
  align-items: center;
  text-align: center;
  gap: 1.6rem;
  padding: 3.2rem 2.8rem;
  border-radius: ${(p) => p.theme.radii.lg};
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

const IconBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 5.6rem;
  height: 5.6rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: rgba(245, 184, 65, 0.12);
  color: ${(p) => p.theme.colors.warning};
`;

const Message = styled.p`
  margin: 0;
  font-size: ${(p) => p.theme.type.base};
  color: ${(p) => p.theme.colors.textPrimary};
  line-height: 1.5;
`;

const Actions = styled(Flex.Row)`
  gap: 1.2rem;
  justify-content: center;
  flex-wrap: wrap;
`;

const GhostBtn = styled.button`
  border-radius: ${(p) => p.theme.radii.md};
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.8rem 1.2rem;
  min-height: 40px;
  font: inherit;
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.textSecondary};
  transition: color ${(p) => p.theme.motion.duration.fast} ${(p) =>
    p.theme.motion.easing.standard};

  &:hover,
  &:focus-visible {
    color: ${(p) => p.theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// The service's own words, verbatim. Deliberately NOT prettified: the whole
// point is that what the user reads is what we would read in the log.
const Details = styled.details`
  width: 100%;
  text-align: left;

  summary {
    cursor: pointer;
    list-style: none;
    font-size: ${(p) => p.theme.type.sm};
    color: ${(p) => p.theme.colors.textSecondary};
    padding: 0.4rem 0;

    &::-webkit-details-marker {
      display: none;
    }
    &:hover,
    &:focus-visible {
      color: ${(p) => p.theme.colors.textPrimary};
    }
  }
`;

const Trace = styled.pre`
  margin: 0.8rem 0 0;
  max-height: 22rem;
  overflow: auto;
  padding: 1.2rem;
  border-radius: ${(p) => p.theme.radii.md};
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  font-family: ${(p) => p.theme.fontMono};
  font-size: ${(p) => p.theme.type.xs};
  line-height: 1.5;
  color: ${(p) => p.theme.colors.textSecondary};
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
`;

const Reason = styled.p`
  margin: 0;
  font-family: ${(p) => p.theme.fontMono};
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.warning};
  word-break: break-word;
  user-select: text;
`;

const copy: Record<
  EscalationInfo['kind'],
  { heading: string; message: string; icon: typeof IconDatabase }
> = {
  storage: {
    heading: 'Low on storage',
    message: 'Your Mac is low on storage. Free up some space, then continue.',
    icon: IconDatabase,
  },
  network: {
    heading: "Couldn't reach the network",
    message:
      "Couldn't reach the network. Check your connection and we'll try again.",
    icon: IconWifiOff,
  },
  generic: {
    heading: 'Needs a quick fix',
    message: 'Something needs a quick fix.',
    icon: IconTool,
  },
};

type RemediationCardProps = {
  escalation: EscalationInfo;
  onOpenStorageSettings: () => void;
  onRetry: () => void;
  onContinueAnyway: () => void;
};

// Everything a human (or we) need to diagnose this from a machine we cannot
// reach — including the app version, so a stale build can be ruled out rather
// than argued about.
// This text goes to the clipboard and onto the screen for the user to paste into
// a public bug report. The service output (stderr) can contain the auth cookie,
// a wallet address, or — if a wallet-import error echoed the input while the
// buffer was live — a private key or mnemonic. Scrub secrets before it leaves.
const redactDiagnostics = (s: string): string =>
  s
    .replace(/\b(0x)?[0-9a-fA-F]{64}\b/g, '[REDACTED_KEY]')
    .replace(/\b([a-z]{3,8}[ \t]+){11,23}[a-z]{3,8}\b/g, '[REDACTED_MNEMONIC]')
    // basic-auth cookie the router hands out (user:token) and any bearer/basic header
    .replace(/(authorization\s*:\s*)(basic|bearer)\s+\S+/gi, '$1$2 [REDACTED]');

const buildDiagnostics = (e: EscalationInfo) => {
  const version =
    typeof (window as any).getAppVersion === 'function'
      ? (window as any).getAppVersion()
      : 'unknown';

  const raw = [
    `Morpheus setup failure`,
    `app version : ${version}`,
    `platform    : ${navigator.userAgent}`,
    `step        : ${e.key}`,
    `classified  : ${e.kind}`,
    `error       : ${e.message ?? '(none reported)'}`,
    ``,
    `--- service output (last lines) ---`,
    e.stderr?.trim() || '(no output captured)',
    ``,
    `full log: ~/Library/Logs/morpheus-app/main.log`,
  ].join('\n');

  return redactDiagnostics(raw);
};

export default function RemediationCard({
  escalation,
  onOpenStorageSettings,
  onRetry,
  onContinueAnyway,
}: RemediationCardProps) {
  const reduceMotion = useReducedMotion();
  const { message, icon: Icon } = copy[escalation.kind];
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  const onCopy = async () => {
    const text = buildDiagnostics(escalation);
    try {
      // The preload's clipboard bridge, NOT navigator.clipboard: main/index.ts
      // denies every permission except media, and `clipboard-sanitized-write`
      // is one of the ones it denies — so navigator.clipboard.writeText()
      // rejects with NotAllowedError in the packaged app. It happens to work in
      // dev, which is exactly how a copy button ships broken.
      const bridge = (window as any).copyToClipboard;
      if (typeof bridge === 'function') {
        bridge(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopyState('copied');
    } catch {
      // A copy button that fails silently is worse than no copy button: the
      // user pastes nothing into the bug report and believes they sent us the
      // error. The text is on screen above regardless — say so.
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 2500);
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Card>
        <IconBadge>
          <Icon size={28} stroke={1.5} />
        </IconBadge>
        <Message>{message}</Message>

        {/* The reason, in the service's own words. A generic card with the
            cause hidden one layer down is why this bug survived three
            remote round-trips. */}
        {escalation.message && <Reason>{escalation.message}</Reason>}

        {(escalation.message || escalation.stderr) && (
          <Details data-testid="setup-error-details">
            <summary>Technical details</summary>
            <Trace>{buildDiagnostics(escalation)}</Trace>
          </Details>
        )}

        <Actions>
          <GhostBtn onClick={onCopy} data-testid="copy-diagnostics">
            <Flex.Row align="center" gap="0.6rem">
              {copyState === 'copied' ? (
                <IconCheck size={16} stroke={1.75} />
              ) : (
                <IconCopy size={16} stroke={1.75} />
              )}
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'failed'
                  ? "Couldn't copy — select the text above"
                  : 'Copy diagnostics'}
            </Flex.Row>
          </GhostBtn>
          {escalation.kind === 'storage' && (
            <Btn onClick={onOpenStorageSettings}>
              <Flex.Row align="center" gap="0.6rem">
                Open Storage Settings
                <IconExternalLink size={16} stroke={1.75} />
              </Flex.Row>
            </Btn>
          )}
          {escalation.kind === 'network' && (
            <Btn onClick={onRetry}>Try again</Btn>
          )}
          {escalation.kind === 'generic' && (
            <>
              <Btn onClick={onRetry}>Try again</Btn>
              <GhostBtn onClick={onContinueAnyway}>Continue anyway</GhostBtn>
            </>
          )}
        </Actions>
      </Card>
    </motion.div>
  );
}
