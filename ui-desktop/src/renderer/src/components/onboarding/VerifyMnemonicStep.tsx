import { useEffect, useMemo, useState } from 'react';
import * as utils from '../../store/utils';
import PropTypes from 'prop-types';
import styled from 'styled-components';

import { AltLayoutNarrow, Btn, Sp } from '../common';
import WizardChrome, { Callout } from './WizardChrome';

const Instruction = styled.p`
  margin: 0 0 2rem;
  font-size: ${(p) => p.theme.type.base};
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textPrimary};
  text-align: left;
`;

const ErrorNote = styled.p`
  margin: 0 0 2rem;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  color: ${(p) => p.theme.colors.warning};
  text-align: left;
`;

const WordGrid = styled.div`
  display: grid;
  gap: 1.4rem;
  margin: 0 0 3rem;
`;

const WordRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
`;

const WordIndex = styled.span`
  flex-shrink: 0;
  width: 2.4rem;
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 600;
  color: ${(p) => p.theme.colors.textSecondary};
`;

const OptionGroup = styled.div`
  display: flex;
  flex: 1;
  gap: 0.8rem;
`;

const OptionButton = styled.button<{ $selected: boolean }>`
  flex: 1;
  min-height: 40px;
  padding: 0.9rem 1.2rem;
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid
    ${(p) => (p.$selected ? p.theme.colors.brand : p.theme.colors.glassBorder)};
  background: ${(p) =>
    p.$selected ? 'rgba(94, 208, 255, 0.14)' : p.theme.colors.glassSurface};
  color: ${(p) => p.theme.colors.textPrimary};
  font: inherit;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  cursor: pointer;
  transition: border-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
    p.theme.motion.easing.standard},
    background ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover,
  &:focus-visible {
    border-color: ${(p) => p.theme.colors.brand};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// Picks a decoy that is neither the correct word for this position nor any
// word already in the user's own phrase (avoids an ambiguous "which one did
// I write down" moment). UI-only randomness — not security-critical.
function pickDecoy(correctWord: string, phraseWords: string[]): string {
  const { mnemonicWords } = utils;
  let candidate = correctWord;
  while (candidate === correctWord || phraseWords.includes(candidate)) {
    candidate =
      mnemonicWords[Math.floor(Math.random() * mnemonicWords.length)];
  }
  return candidate;
}

type Round = { word: string; options: string[] };

const VerifyMnemonicStep = (props) => {
  const words = useMemo(
    () => (props.mnemonic || '').trim().split(/\s+/).filter(Boolean),
    [props.mnemonic]
  );

  // Built once per phrase so options don't reshuffle under the user's thumb
  // on re-render; a fresh mount (Back then forward again) gets a fresh shuffle.
  const rounds: Round[] = useMemo(
    () =>
      words.map((word) => {
        const decoy = pickDecoy(word, words);
        const options = Math.random() < 0.5 ? [word, decoy] : [decoy, word];
        return { word, options };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words]
  );

  const [picks, setPicks] = useState<(string | null)[]>(() =>
    words.map(() => null)
  );

  const allPicked = picks.length === 12 && picks.every(Boolean);

  // Feeds the assembled guess into the SAME `mnemonicAgain` state the app
  // already validates, the moment the last word is chosen — before the user
  // can click Confirm (a later, separate click) — so onMnemonicAccepted
  // always reads an up-to-date value when it runs.
  useEffect(() => {
    if (allPicked) {
      props.onInputChange({ id: 'mnemonicAgain', value: picks.join(' ') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);

  const onPick = (index: number, word: string) => {
    setPicks((prev) => {
      const next = [...prev];
      next[index] = word;
      return next;
    });
  };

  return (
    <WizardChrome
      title="Verify Your Recovery Phrase"
      step={4}
      totalSteps={4}
      onBack={props.onBack}
      data-testid="onboarding-container"
    >
      <form data-testid="mnemonic-form" onSubmit={props.onMnemonicAccepted}>
        <AltLayoutNarrow>
          <Instruction>
            Tap the word you saved for each position below — no typing
            needed.
          </Instruction>
        </AltLayoutNarrow>

        {props.errors.mnemonicAgain && (
          <AltLayoutNarrow>
            <ErrorNote role="alert" data-testid="verify-mismatch-error">
              That&apos;s not quite right — go Back to review your phrase,
              then try again.
            </ErrorNote>
          </AltLayoutNarrow>
        )}

        <Callout>
          Pick the word you wrote down for each position. Getting one wrong
          just means trying again — nothing is lost.
        </Callout>

        <AltLayoutNarrow>
          <Sp mt={3}>
            <WordGrid data-testid="mnemonic-verify-grid">
              {rounds.map((round, index) => (
                <WordRow key={index}>
                  <WordIndex>{index + 1}.</WordIndex>
                  <OptionGroup
                    role="group"
                    aria-label={`Word ${index + 1}`}
                  >
                    {round.options.map((option, optionIndex) => (
                      <OptionButton
                        key={option}
                        type="button"
                        $selected={picks[index] === option}
                        aria-pressed={picks[index] === option}
                        aria-label={`Word ${index + 1}, option ${
                          optionIndex + 1
                        }: ${option}`}
                        onClick={() => onPick(index, option)}
                      >
                        {option}
                      </OptionButton>
                    ))}
                  </OptionGroup>
                </WordRow>
              ))}
            </WordGrid>
          </Sp>
          <Sp mt={2}>
            <Btn
              data-testid="verify-submit-btn"
              disabled={!allPicked}
              submit
              block
              key="sendMnemonic"
            >
              Done
            </Btn>
          </Sp>
        </AltLayoutNarrow>
      </form>
    </WizardChrome>
  );
};

VerifyMnemonicStep.propTypes = {
  onMnemonicAccepted: PropTypes.func.isRequired,
  onInputChange: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  mnemonic: PropTypes.string,
  errors: utils.errorPropTypes('mnemonicAgain')
};

export default VerifyMnemonicStep;
