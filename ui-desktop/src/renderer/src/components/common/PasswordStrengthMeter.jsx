import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { IconCheck } from '@tabler/icons-react';
import { GetPasswordStrength, MaxScore } from '../../lib/PasswordStrength';
import {
  Container,
  BarRow,
  Track,
  Fill,
  ScoreLabel,
  ChecklistHeading,
  Checklist,
  ChecklistItem,
  CheckDot,
  SuggestionLine
} from './PasswordStrengthMeter.styles';

// Strength ramp: neutral -> amber -> green. NEVER red at the low end — a
// half-typed password is "not finished yet," not an error (Wix/NN-g).
// `tone` is a theme.colors key, looked up inside the styled-components so no
// hex ever appears here.
const STRENGTH_LEVELS = [
  {
    label: 'Too weak',
    tone: 'textMuted',
    suggestion: 'A little longer would make this much stronger.'
  },
  {
    label: 'Very weak',
    tone: 'textMuted',
    suggestion: 'A few more characters would help a lot.'
  },
  {
    label: 'Almost there',
    tone: 'warning',
    suggestion: 'Getting there — a bit more length or variety helps.'
  },
  {
    label: 'Strong',
    tone: 'brand',
    suggestion: 'Good — this is a strong password.'
  },
  {
    label: 'Very strong',
    tone: 'success',
    suggestion: "Nice — that's a strong one."
  }
];

const VARIETY_PATTERNS = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];

/**
 * Presentation-only guidance checks. These never block submission — nothing
 * here is enforced, they only light up as satisfied (see PasswordStep's
 * "guide, not a requirement" copy).
 * @param {string} password
 */
const getChecklist = password => [
  { key: 'length', label: '12+ characters', met: password.length >= 12 },
  {
    key: 'variety',
    label: 'A mix of letters, numbers & symbols',
    met: VARIETY_PATTERNS.filter(re => re.test(password)).length >= 2
  }
];

/**
 * @component
 * @param {Object} param
 * @param {string} param.password
 * @param {(result: import("../../lib/PasswordStrength").ScoreResult)=>void} param.onChange
 */
const PasswordStrengthMeter = ({ password, onChange = () => {} }) => {
  const [score, setScore] = useState(0);

  useEffect(() => {
    const res = GetPasswordStrength(password);
    setScore(res.score || 0);
    onChange(res);
  }, [password]);

  if (!password) {
    return null;
  }

  const level = STRENGTH_LEVELS[Math.min(score, STRENGTH_LEVELS.length - 1)];
  // +1 so a fresh "too weak" password still shows a visible sliver, not 0%.
  const widthPercent = ((score + 1) / (MaxScore + 1)) * 100;
  const checklist = getChecklist(password);

  return (
    <Container>
      <BarRow>
        <Track>
          <Fill $width={`${widthPercent}%`} $tone={level.tone} />
        </Track>
        <ScoreLabel $tone={level.tone}>{level.label}</ScoreLabel>
      </BarRow>

      <ChecklistHeading>Stronger if:</ChecklistHeading>
      <Checklist>
        {checklist.map(item => (
          <ChecklistItem key={item.key} $met={item.met}>
            <CheckDot $met={item.met}>{item.met && <IconCheck size={12} stroke={3} />}</CheckDot>
            {item.label}
          </ChecklistItem>
        ))}
      </Checklist>

      <SuggestionLine>{level.suggestion}</SuggestionLine>
    </Container>
  );
};

PasswordStrengthMeter.propTypes = {
  password: PropTypes.string,
  onChange: PropTypes.func
};

export default PasswordStrengthMeter;
