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
import WizardChrome from './WizardChrome';
import Message from './Message';

// Re-skin only. crypto-version drops the live zxcvbn suggestion tooltip for a
// static hint — that is losing a feature that helps people pick a password
// they can actually keep, not a change of look, so the tooltip and its state
// stay. Its replacement copy ("unlocks the app on this Mac") is also wrong for
// the Windows and Linux builds, so that does not come across either.

const PasswordMessage = styled(Message)`
  text-align: left;
  color: ${p => p.theme.colors.dark};
  text-align: justify;
`;

const Green = styled.div`
  display: inline-block;
  color: ${p => p.theme.colors.success};
`;

const PasswordInputWrap = styled.div`
  position: relative;
`;

// Was a hardcoded #20dc8e — classic's green, pinned. It read as correct only
// because classic happened to be the look at the time; under aurora this button
// stayed green while everything around it went cyan. Both this and crypto's own
// version (which tokenizes the border but pins a cyan hover) break the swap in
// opposite directions; the tokens fix both.
const SecondaryBtn = styled(Btn)`
  border-radius: ${p => p.theme.radii.md};
  border: 1px solid ${p => p.theme.colors.brand};
  color: ${p => p.theme.colors.brand};
  background: transparent;

  &:not([disabled]):hover,
  &:not([disabled]):focus {
    background: ${p => p.theme.colors.brandTint(0.08)};
  }
`;

const PasswordStep = props => {
  const [typed, setTyped] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const onPasswordSubmit = (e, useImportFlow) => {
    e.preventDefault();
    props.onPasswordSubmit({ clearOnError: false, useImportFlow });
  };
  let tooltipTimeout;

  return (
    <WizardChrome
      title="Let`s get started"
      step={2}
      totalSteps={4}
      onBack={props.onBack}
      data-testid="onboarding-container"
    >
      <AltLayoutNarrow>
        <form data-testid="pass-form">
          <PasswordMessage>
            Enter a strong password until the meter turns <Green>green</Green>.
          </PasswordMessage>
          <PasswordInputWrap>
            <Sp mt={2}>
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
                <PasswordStrengthMeter
                  password={props.password}
                  onChange={res => {
                    const string = res?.suggestions?.join(`\n`);
                    setSuggestion(string);
                  }}
                />
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
            <Btn block onClick={(e) => onPasswordSubmit(e, false)}>
              Create a new wallet
            </Btn>
          </Sp>
          <Sp style={{ marginTop: '10px'}}>
            <SecondaryBtn block onClick={(e) => onPasswordSubmit(e, true)}>
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
