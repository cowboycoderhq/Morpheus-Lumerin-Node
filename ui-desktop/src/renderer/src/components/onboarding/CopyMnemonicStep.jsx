import PropTypes from 'prop-types';
import styled from 'styled-components';
import React from 'react';

import { Btn, Sp } from '../common';
import SecondaryBtn from './SecondaryBtn';
import AltLayoutNarrow from '../common/AltLayoutNarrow';
import WizardChrome, { Callout } from './WizardChrome';

const Mnemonic = styled.div`
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 2;
  text-align: center;
  color: ${p => p.theme.colors.brand};
  word-spacing: 1.6rem;
`;

export default class CopyMnemonicStep extends React.Component {
  static propTypes = {
    onUseUserMnemonicToggled: PropTypes.func.isRequired,
    onMnemonicCopiedToggled: PropTypes.func.isRequired,
    mnemonic: PropTypes.string
  };

  render() {
    return (
      <WizardChrome
        title="Recovery Mnemonic"
        step={3}
        totalSteps={4}
        onBack={this.props.onBack}
        data-testid="onboarding-container"
      >
        <Callout tone="warning">
          Copy the following word list and keep it in a safe place. You will
          need these to recover your wallet in the future — don’t lose it.
        </Callout>
        <Sp mt={3}>
          <Mnemonic data-testid="mnemonic-label">
            {this.props.mnemonic}
          </Mnemonic>
        </Sp>
        <AltLayoutNarrow>
          <Sp mt={5}>
            <Btn
              data-testid="copied-mnemonic-btn"
              autoFocus
              onClick={this.props.onMnemonicCopiedToggled}
              block
              key="confirmMnemonic"
            >
              I’ve copied it
            </Btn>
          </Sp>
          {/* <Sp mt={2}>
            <SecondaryBtn
              data-testid="recover-btn"
              onClick={this.props.onUseUserMnemonicToggled}
              block
            >
              DELETE
            </SecondaryBtn>
          </Sp> */}
        </AltLayoutNarrow>
      </WizardChrome>
    );
  }
}
