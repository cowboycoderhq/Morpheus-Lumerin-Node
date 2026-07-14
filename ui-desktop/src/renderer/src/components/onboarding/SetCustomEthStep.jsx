import PropTypes from 'prop-types';
import styled from 'styled-components';
import React from 'react';
import { AltLayout, AltLayoutNarrow, Btn, Sp, TextInput } from '../common';
import { Callout } from './WizardChrome';

const Heading = styled.p`
  margin: 0 0 2rem;
  font-size: ${p => p.theme.type.base};
  line-height: 1.55;
  color: ${p => p.theme.colors.textPrimary};
  text-align: left;
`;

const GhostBtn = styled(Btn)`
  border-radius: ${(p) => p.theme.radii.md};
  background: transparent;
  border: 1px solid ${p => p.theme.colors.glassBorder};
  box-shadow: none;

  &:not([disabled]):hover,
  &:not([disabled]):focus {
    background: ${p => p.theme.colors.glassSurface};
    box-shadow: none;
  }
`;

export const SetCustomEthStep = props => {

  return (
    <AltLayout title="Advanced: Custom ETH Node" data-testid="onboarding-container">
      <AltLayoutNarrow>
        <Heading>
          Optional — used to talk to the Ethereum blockchain through your own
          node instead of the default one.
        </Heading>
      </AltLayoutNarrow>

      <Callout>
        Most people should skip this — it&apos;s only for advanced users
        running their own node. You can always set this later in Settings.
      </Callout>

      <AltLayoutNarrow>
        <Sp mt={3}>
          <TextInput
            data-testid="ethNode-field"
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
            data-testid="skip-btn"
            autoFocus
            onClick={(e) => {
              e.preventDefault();
              props.onInputChange({ value: "", id: 'customEthNode' });
              props.onEthNodeSet(e)
            }}
            block
          >
            Skip — use the default
          </Btn>
        </Sp>
        <Sp mt={2}>
          <GhostBtn
            data-testid="accept-btn"
            onClick={props.onEthNodeSet}
            block
          >
            Use this node instead
          </GhostBtn>
        </Sp>
      </AltLayoutNarrow>
    </AltLayout>
  );
};

SetCustomEthStep.propTypes = {
  onInputChange: PropTypes.func.isRequired,
  onEthNodeSet: PropTypes.func.isRequired,
  customEthNode: PropTypes.string,
  errors: PropTypes.object
};
