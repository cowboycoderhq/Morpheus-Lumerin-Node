import React, { useState } from 'react';
import styled from 'styled-components';
import PropTypes from 'prop-types';
import 'react-hint/css/index.css';
import * as utils from '../../store/utils';
import {
  PasswordStrengthMeter,
  TextInput,
  AltLayoutNarrow,
  Btn,
  Sp,
  Tooltip
} from '../common';
import WizardChrome, { Callout } from './WizardChrome';

// crypto-version's copy and structure, with its two defects fixed:
//
// - It says the password unlocks the app "on this Mac". The app ships Windows
//   and Linux builds too (see electron.builder targets), so the sentence is
//   simply false for those users. "this device" is true everywhere and costs
//   nothing.
// - It drops the live zxcvbn suggestion tooltip for a static hint. The meter
//   tells you a password is weak; the suggestions tell you what to DO about it,
//   which is the part that changes the password someone actually picks. Kept —
//   it costs one piece of state and rides alongside crypto's MeterHint.

const Explainer = styled.p`
  margin: 0 0 2.4rem;
  font-size: ${p => p.theme.type.base};
  line-height: 1.55;
  color: ${p => p.theme.colors.textPrimary};
  text-align: left;
`;

const MeterHint = styled.p`
  margin: 0.8rem 0 0;
  font-size: ${p => p.theme.type.xs};
  color: ${p => p.theme.colors.textSecondary};
`;

// Anchors the suggestion tooltip to the field.
const PasswordInputWrap = styled.div`
  position: relative;
`;

const SecondaryBtn = styled(Btn)`
  border-radius: ${p => p.theme.radii.md};
  border: 1px solid ${p => p.theme.colors.brand};
  color: ${p => p.theme.colors.brand};
  background: transparent;

  /* Was a pinned cyan literal — stays cyan under classic. */
  &:not([disabled]):hover,
  &:not([disabled]):focus {
    background: ${p => p.theme.colors.brandTint(0.08)};
  }
`;

const PasswordStep = props => {
  const [typed, setTyped] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  let tooltipTimeout;

  const onPasswordSubmit = (e, useImportFlow) => {
    e.preventDefault();
    props.onPasswordSubmit({ clearOnError: false, useImportFlow });
  };

  return (
    <WizardChrome
      title="Create a Password"
      step={2}
      totalSteps={4}
      onBack={props.onBack}
      data-testid="onboarding-container"
    >
      <AltLayoutNarrow>
        <Explainer>
          This password unlocks the app on this device. It does not recover
          your wallet — your Recovery Phrase does that, in the next step.
        </Explainer>
      </AltLayoutNarrow>

      <Callout>
        A wallet is a secure account only you control — no signup, no company
        holds it. This app creates one for you on this device.
      </Callout>

      <AltLayoutNarrow>
        <form data-testid="pass-form">
          <PasswordInputWrap>
            <Sp mt={4}>
              <Tooltip
                content={suggestion}
                show={typed && props.password && suggestion.length}
              />
              <TextInput
                data-testid="pass-field"
                autoFocus
                onChange={e => {
                  if (!typed) {
                    tooltipTimeout && clearTimeout(tooltipTimeout);
                    setTyped(true);
                    tooltipTimeout = setTimeout(() => setTyped(false), 5000);
                  }
                  return props.onInputChange(e);
                }}
                error={props.errors.password}
                label="Password"
                value={props.password}
                type="password"
                id="password"
              />
              {!props.errors.password && (
                <>
                  <PasswordStrengthMeter
                    password={props.password}
                    onChange={res => {
                      const string = res?.suggestions?.join(`\n`);
                      setSuggestion(string);
                    }}
                  />
                  <MeterHint>
                    This bar is a guide, not a requirement — longer and more
                    unique is safer.
                  </MeterHint>
                </>
              )}
            </Sp>
          </PasswordInputWrap>
          <Sp mt={3}>
            <TextInput
              data-testid="pass-again-field"
              onChange={props.onInputChange}
              error={props.errors.passwordAgain}
              label="Repeat password"
              value={props.passwordAgain}
              type="password"
              id="passwordAgain"
            />
          </Sp>
          <Sp mt={6}>
            <Btn block onClick={e => onPasswordSubmit(e, false)}>
              Create a new wallet
            </Btn>
          </Sp>
          <Sp style={{ marginTop: '10px' }}>
            <SecondaryBtn block onClick={e => onPasswordSubmit(e, true)}>
              Import an existing wallet
            </SecondaryBtn>
          </Sp>
        </form>
      </AltLayoutNarrow>
    </WizardChrome>
  );
};

PasswordStep.propTypes = {
  onPasswordSubmit: PropTypes.func.isRequired,
  onInputChange: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  passwordAgain: PropTypes.string,
  password: PropTypes.string,
  errors: utils.errorPropTypes('passwordAgain', 'password')
};

export default PasswordStep;
