import TermsAndConditions from '../../components/common/TermsAndConditions';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import React from 'react';

import { AltLayoutNarrow, Btn, Checkbox, Sp } from '../common';
import WizardChrome from './WizardChrome';

// Re-skin only. crypto-version rewrites this screen twice over: it collapses
// the two consents into ONE checkbox that sets both flags, and it drops the
// TermsAndConditions scroll box for a one-line summary behind a "read the full
// license" link. Neither is a look — they change what the user agrees to and
// whether the agreement is in front of them when they agree to it. Both
// consents and the terms text stay; only the chrome comes across.

const Summary = styled.p`
  margin: 0;
  font-size: ${p => p.theme.type.base};
  line-height: 1.55;
  color: ${p => p.theme.colors.textPrimary};
  text-align: left;
`;

// The colour MUST live here, on the container. TermsAndConditions renders its
// markdown through marked-react's own elements and accepts no props at all —
// the `ParagraphComponent` the old call site passed was dead, so nothing styled
// those nodes and they inherited. Setting the colour on a paragraph component
// instead leaves the actual terms dark-on-dark and unreadable, which is how the
// screen looked until the isolate rendered it.
const TermsBox = styled.div`
  width: 100%;
  height: 13rem;
  overflow: auto;
  margin: 1.6rem 0;
  padding: 1.2rem 1.6rem;
  font-size: ${p => p.theme.type.sm};
  line-height: 1.5;
  color: ${p => p.theme.colors.textPrimary};
  border-radius: ${p => p.theme.radii.sm};
  background: ${p => p.theme.colors.glassSurface};
  border: 1px solid ${p => p.theme.colors.glassBorder};
`;

// A div, not a label: the license row carries a link, and a wrapping label
// would make clicking "software license" toggle the consent instead of opening
// it. The label wraps the text only — clicking the words still toggles.
const CheckboxRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  min-height: 40px;
  padding: 0.4rem 0;
  font-size: ${p => p.theme.type.sm};
  color: ${p => p.theme.colors.textPrimary};
`;

const RowLabel = styled.label`
  cursor: pointer;
`;

const LicenseLink = styled.a`
  margin-left: 0.5rem;
  color: ${p => p.theme.colors.secondaryLight};
  text-decoration: underline;
  cursor: pointer;
`;

const TermsStep = props => {
  const onCheckboxToggle = e => {
    props.onInputChange({ id: e.target.id, value: e.target.checked });
  };

  return (
    <WizardChrome
      title="Accept to Continue"
      step={1}
      totalSteps={4}
      data-testid="onboarding-container"
    >
      <AltLayoutNarrow>
        <Summary>Please read and accept these terms and conditions.</Summary>

        <TermsBox data-testid="terms-box">
          <TermsAndConditions />
        </TermsBox>

        <CheckboxRow>
          <Checkbox
            data-testid="accept-terms-chb"
            onChange={onCheckboxToggle}
            checked={props.termsCheckbox}
            id="termsCheckbox"
          />
          <RowLabel htmlFor="termsCheckbox">
            I have read and accept these terms
          </RowLabel>
        </CheckboxRow>

        <CheckboxRow>
          <Checkbox
            data-testid="accept-license-chb"
            onChange={onCheckboxToggle}
            checked={props.licenseCheckbox}
            id="licenseCheckbox"
          />
          <RowLabel htmlFor="licenseCheckbox">
            I have read and accept the
          </RowLabel>
          <LicenseLink onClick={props.onTermsLinkClick}>
            software license
          </LicenseLink>
        </CheckboxRow>

        <Sp mt={5}>
          <Btn
            data-testid="accept-terms-btn"
            autoFocus
            disabled={!props.licenseCheckbox || !props.termsCheckbox}
            onClick={props.onTermsAccepted}
            block
          >
            Accept
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
