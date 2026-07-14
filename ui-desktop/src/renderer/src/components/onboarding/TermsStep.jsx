import PropTypes from 'prop-types';
import styled from 'styled-components';
import React from 'react';

import { AltLayoutNarrow, Btn, Checkbox, Sp } from '../common';
import WizardChrome from './WizardChrome';

const Summary = styled.p`
  margin: 0 0 2.4rem;
  font-size: ${p => p.theme.type.base};
  line-height: 1.55;
  color: ${p => p.theme.colors.textPrimary};
  text-align: left;
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  min-height: 40px;
  padding: 0.4rem 0;
  cursor: pointer;
  font-size: ${p => p.theme.type.sm};
  color: ${p => p.theme.colors.textPrimary};
`;

// Checkbox comes from common/ — see the note there on why a raw <input> can't
// simply be tinted (unchecked, the platform still paints its white box).

const LicenseLink = styled.a`
  color: ${p => p.theme.colors.secondaryLight};
  text-decoration: underline;
  cursor: pointer;
`;

const TermsStep = props => {
  // Presentation shows ONE checkbox, but the (unchanged) onboarding state
  // machine gates `onTermsAccepted` on BOTH `termsCheckbox` and
  // `licenseCheckbox` being true — so a single toggle sets both via the
  // existing `onInputChange` handler. No state-machine logic is touched.
  const onCheckboxToggle = e => {
    props.onInputChange({ id: 'termsCheckbox', value: e.target.checked });
    props.onInputChange({ id: 'licenseCheckbox', value: e.target.checked });
  };

  const accepted = props.termsCheckbox && props.licenseCheckbox;

  return (
    <WizardChrome title="Before You Begin" step={1} totalSteps={4} data-testid="onboarding-container">
      <AltLayoutNarrow>
        <Summary>
          This is free, open-source software provided as-is, with no
          warranty. By continuing, you accept the terms.{' '}
          <LicenseLink onClick={props.onTermsLinkClick}>
            Read the full license
          </LicenseLink>
          .
        </Summary>

        <CheckboxRow htmlFor="termsCheckbox">
          <Checkbox
            data-testid="accept-terms-chb"
            onChange={onCheckboxToggle}
            checked={accepted}
            type="checkbox"
            id="termsCheckbox"
          />
          I have read and accept the terms
        </CheckboxRow>

        <Sp mt={5}>
          <Btn
            data-testid="accept-terms-btn"
            autoFocus
            disabled={!accepted}
            onClick={props.onTermsAccepted}
            block
          >
            Continue
          </Btn>
        </Sp>
      </AltLayoutNarrow>
    </WizardChrome>
  );
};

TermsStep.propTypes = {
  onTermsLinkClick: PropTypes.func.isRequired,
  onTermsAccepted: PropTypes.func.isRequired,
  licenseCheckbox: PropTypes.bool.isRequired,
  termsCheckbox: PropTypes.bool.isRequired,
  onInputChange: PropTypes.func.isRequired
};

export default TermsStep;
