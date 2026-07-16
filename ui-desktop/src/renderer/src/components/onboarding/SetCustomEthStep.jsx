import styled from 'styled-components';
import React from 'react';
import SecondaryBtn from './SecondaryBtn';
import { AltLayoutNarrow, Btn, Sp, TextInput } from '../common';
import WizardChrome, { Callout } from './WizardChrome';

const Heading = styled.p`
  margin: 0 0 2rem;
  font-size: ${p => p.theme.type.base};
  line-height: 1.55;
  color: ${p => p.theme.colors.textPrimary};
  text-align: left;
`;

export const SetCustomEthStep = props => {

  return (
    <WizardChrome title="Advanced: Custom ETH Node" onBack={props.onBack} data-testid="onboarding-container">
      <AltLayoutNarrow>
        <Heading>
          Set a custom ETH node url that will be used for blockchain
          interactions instead of the default. This can be set later in
          Settings.
        </Heading>
      </AltLayoutNarrow>

      <Callout>
        Most people should skip this — it&apos;s only for advanced users
        running their own node.
      </Callout>

      <AltLayoutNarrow>
        <Sp mt={3}>
          <TextInput
            data-testid="ethNode-field"
            autoFocus
            onChange={props.onInputChange}
            placeholder={"{wss|https}://{url}"}
            onPaste={e => {
              e.preventDefault();
              const value = e.clipboardData.getData('Text').trim();
              props.onInputChange({ value, id: 'customEthNode' });
            }}
            label="Custom ETH Node Url"
            error={props.errors.customEthNode}
            value={props.customEthNode || ''}
            id={'customEthNode'}
          />
        </Sp>

        <Sp mt={6}>
          <Btn
            data-testid="accept-btn"
            autoFocus
            onClick={props.onEthNodeSet}
            block
          >
            Accept
          </Btn>
        </Sp>
        <Sp mt={2}>
            <SecondaryBtn
              data-testid="skip-btn"
              onClick={(e) => {
                e.preventDefault();
                props.onInputChange({ value: "", id: 'customEthNode' });
                props.onEthNodeSet(e)
              }}
              block
            >
              Skip
            </SecondaryBtn>
          </Sp>
      </AltLayoutNarrow>
    </WizardChrome>
  );
};
