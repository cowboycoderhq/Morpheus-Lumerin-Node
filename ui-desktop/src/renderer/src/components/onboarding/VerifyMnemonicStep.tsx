import * as utils from '../../store/utils';
import PropTypes from 'prop-types';

import { TextInput, Btn, Sp } from '../common';
import SecondaryBtn from './SecondaryBtn';
import WizardChrome, { Callout } from './WizardChrome';
import AltLayoutNarrow from '../common/AltLayoutNarrow';

// Re-skinned into WizardChrome; the verification itself is untouched.
//
// The Aurora design replaces typing the phrase with tapping words from a grid.
// That is a different check, not a different look: it verifies recognition
// rather than transcription, and it drops the `shouldSubmit` / `getTooltip` /
// `onMnemonicCopiedToggled` props the onboarding state machine hands this step —
// so the step-machine contract breaks with it. This is the last thing standing
// between a user and a wallet they cannot recover, so it keeps the typed
// verification and every prop the machine expects.
const VerifyMnemonicStep = props => {
  const id = 'mnemonicAgain';
  return (
    <WizardChrome
      title="Verify Your Recovery Phrase"
      step={4}
      totalSteps={4}
      onBack={props.onBack}
      data-testid="onboarding-container"
    >
      <form data-testid="mnemonic-form" onSubmit={props.onMnemonicAccepted}>
        <Callout>
          To verify you have copied the recovery passphrase correctly, enter the
          12 words provided before in the field below.
        </Callout>
        <Sp mt={3}>
          <TextInput
            id={id}
            data-testid="mnemonic-field"
            autoFocus
            onChange={props.onInputChange}
            onPaste={e => {
              e.preventDefault();
              const value = e.clipboardData.getData('Text').trim();
              props.onInputChange({ value, id });
            }}
            label="Recovery passphrase"
            error={props.errors.mnemonicAgain}
            value={props.mnemonicAgain || ''}
            rows={2}
          />
        </Sp>
        <AltLayoutNarrow>
          <Sp mt={5}>
            <Btn
              data-rh-negative
              data-disabled={!props.shouldSubmit(props.mnemonicAgain)}
              data-rh={props.getTooltip(props.mnemonicAgain)}
              submit={props.shouldSubmit(props.mnemonicAgain)}
              block
              key="sendMnemonic"
            >
              Done
            </Btn>
          </Sp>
          <Sp mt={2}>
            <SecondaryBtn
              data-testid="goback-btn"
              onClick={props.onMnemonicCopiedToggled}
              block
            >
              Go back
            </SecondaryBtn>
          </Sp>
        </AltLayoutNarrow>
      </form>
    </WizardChrome>
  );
};

VerifyMnemonicStep.propTypes = {
  onMnemonicCopiedToggled: PropTypes.func.isRequired,
  onMnemonicAccepted: PropTypes.func.isRequired,
  onInputChange: PropTypes.func.isRequired,
  mnemonicAgain: PropTypes.string,
  shouldSubmit: PropTypes.func.isRequired,
  getTooltip: PropTypes.func.isRequired,
  errors: utils.errorPropTypes('mnemonicAgain')
};

export default VerifyMnemonicStep;
