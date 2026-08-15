import PropTypes from 'prop-types';
import styled from 'styled-components';
import React, { useState } from 'react';
import { IconCopy, IconCheck, IconPrinter } from '@tabler/icons-react';

import { AltLayoutNarrow, Btn, Sp } from '../common';
import WizardChrome, { Callout } from './WizardChrome';

const Mnemonic = styled.div`
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 2;
  text-align: center;
  color: ${p => p.theme.colors.brand};
  word-spacing: 1.6rem;
  user-select: all;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 1.2rem;
  justify-content: center;
  flex-wrap: wrap;
`;

const GhostBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 40px;
  padding: 0.8rem 1.4rem;
  border-radius: ${p => p.theme.radii.md};
  border: 1px solid ${p => p.theme.colors.glassBorder};
  background: ${p => p.theme.colors.glassSurface};
  color: ${p => p.theme.colors.textPrimary};
  font: inherit;
  font-size: ${p => p.theme.type.sm};
  font-weight: 600;
  cursor: pointer;
  transition: background ${p => p.theme.motion.duration.fast} ${p =>
    p.theme.motion.easing.standard};

  &:hover,
  &:focus-visible {
    background: ${p => p.theme.colors.glassSurfaceHover};
  }

  &:focus-visible {
    outline: 2px solid ${p => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// Print the phrase to paper. Deliberately NO digital file is written to disk —
// a plaintext seed file is a security anti-pattern (and contradicts the very
// warning shown on this step). Prints only the phrase in an isolated iframe.
const printMnemonic = mnemonic => {
  const rows = mnemonic
    .trim()
    .split(/\s+/)
    .map((w, i) => `<li><span>${i + 1}</span>${w}</li>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8" />
    <title>Morpheus Recovery Phrase</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;margin:0;padding:48px;color:#111}
      h1{font-size:20px;margin:0 0 8px}
      p{font-size:12px;color:#444;max-width:540px;line-height:1.5;margin:0 0 4px}
      ol{list-style:none;padding:0;margin:28px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:14px 40px;max-width:580px}
      li{font-size:16px;font-weight:600;border-bottom:1px solid #ccc;padding:6px 0}
      li span{display:inline-block;width:22px;color:#999;font-weight:400}
      .warn{margin-top:32px;font-size:11px;color:#a00;font-weight:600}
    </style></head><body>
      <h1>Morpheus Recovery Phrase</h1>
      <p>These 12 words are the only way to recover your wallet. Store this page somewhere safe and private.</p>
      <p>Anyone who has these words can take your funds.</p>
      <ol>${rows}</ol>
      <p class="warn">Do not photograph, email, or store this digitally.</p>
    </body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 1000);
};

const CopyMnemonicStep = props => {
  const [copied, setCopied] = useState(false);

  const onCopyClick = () => {
    window.copyToClipboard(props.mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <WizardChrome
      title="Save Your Recovery Phrase"
      step={3}
      totalSteps={4}
      onBack={props.onBack}
      data-testid="onboarding-container"
    >
      <Callout tone="warning">
        These 12 words are the <strong>only</strong> way to recover your
        wallet. Anyone who has them can take your funds. Never share them,
        and don&apos;t store them in a screenshot or email.
      </Callout>

      <Sp mt={4}>
        <Mnemonic data-testid="mnemonic-label">{props.mnemonic}</Mnemonic>
      </Sp>

      <Sp mt={3}>
        <ActionRow>
          <GhostBtn
            type="button"
            data-testid="copy-mnemonic-btn"
            onClick={onCopyClick}
          >
            {copied ? (
              <>
                <IconCheck size={18} stroke={2} />
                Copied
              </>
            ) : (
              <>
                <IconCopy size={18} stroke={1.75} />
                Copy
              </>
            )}
          </GhostBtn>
          <GhostBtn
            type="button"
            data-testid="print-mnemonic-btn"
            onClick={() => printMnemonic(props.mnemonic)}
          >
            <IconPrinter size={18} stroke={1.75} />
            Print
          </GhostBtn>
        </ActionRow>
      </Sp>

      <AltLayoutNarrow>
        <Sp mt={5}>
          <Btn
            data-testid="copied-mnemonic-btn"
            autoFocus
            onClick={props.onMnemonicCopiedToggled}
            block
            key="confirmMnemonic"
          >
            I&apos;ve saved my Recovery Phrase
          </Btn>
        </Sp>
      </AltLayoutNarrow>
    </WizardChrome>
  );
};

CopyMnemonicStep.propTypes = {
  onUseUserMnemonicToggled: PropTypes.func,
  onMnemonicCopiedToggled: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  mnemonic: PropTypes.string
};

export default CopyMnemonicStep;
