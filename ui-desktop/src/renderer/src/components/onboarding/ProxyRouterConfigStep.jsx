import * as utils from '../../store/utils';
import PropTypes from 'prop-types';
import React from 'react';
import styled from 'styled-components';
import { useForm } from 'react-hook-form';

import { TextInput, AltLayout, Btn, Sp, AltLayoutNarrow, Checkbox } from '../common';
import SecondaryBtn from './SecondaryBtn';

// A label, not a span: this row's raw input became a real <Checkbox>, and the
// text beside a checkbox should toggle it. It was a span, so the only hit target
// was the box itself.
const Subtext = styled.label`
  color: ${p => p.theme.colors.dark};
  cursor: pointer;
`;

const ProxyRouterConfigStep = props => {
  const onCheckboxToggle = e => {
    props.onInputChange({ id: e.target.id, value: e.target.checked });
  };

  return (
    <AltLayout
      title="Configure Default Pool"
      data-testid="onboarding-container"
    >
      <AltLayoutNarrow>
        <form
          onSubmit={props.onProxyRouterConfigured}
          data-testid="pr-config-form"
        >
          <div style={{ display: 'flex' }}>
            <Checkbox
              style={{ marginLeft: '0' }}
              data-testid="use-titan-lightning"
              onChange={onCheckboxToggle}
              checked={props.isTitanLightning}
              id="isTitanLightning"
            />
            <Subtext htmlFor="isTitanLightning">
              Use Titan Pool for Lightning Payouts
            </Subtext>
          </div>
          {props.isTitanLightning ? (
            <Sp mt={2}>
              <TextInput
                autoFocus
                onChange={props.onInputChange}
                noFocus
                error={props.errors.lightningAddress}
                placeholder="bob@getalby.com"
                label="Lightning Address"
                value={props.lightningAddress}
                type="text"
                id="lightningAddress"
              />
            </Sp>
          ) : (
            <>
              <Sp mt={2}>
                <TextInput
                  autoFocus
                  onChange={props.onInputChange}
                  noFocus
                  error={props.errors.proxyDefaultPool}
                  placeholder="example: btc.global.luxor.tech:8888"
                  label="Pool BTC Mining Host & Port"
                  value={props.proxyDefaultPool}
                  type="text"
                  id="proxyDefaultPool"
                />
              </Sp>
              <Sp mt={2}>
                <TextInput
                  onChange={props.onInputChange}
                  error={props.errors.proxyPoolUsername}
                  placeholder="account.worker"
                  label="Pool Username"
                  value={props.proxyPoolUsername}
                  type="text"
                  id="proxyPoolUsername"
                />
              </Sp>
            </>
          )}

          <Sp mt={2}>
            <SecondaryBtn onClick={props.onRunWithoutProxyRouter} block>
              Or run wallet without validator node
            </SecondaryBtn>
          </Sp>
          <Sp mt={6}>
            <Btn block submit>
              Continue
            </Btn>
          </Sp>
        </form>
      </AltLayoutNarrow>
    </AltLayout>
  );
};

ProxyRouterConfigStep.propTypes = {
  onProxyRouterConfigured: PropTypes.func.isRequired,
  onRunWithoutProxyRouter: PropTypes.func.isRequired,
  onInputChange: PropTypes.func.isRequired,
  proxyDefaultPool: PropTypes.string,
  errors: utils.errorPropTypes('proxyDefaultPool')
};

export default ProxyRouterConfigStep;
