import React, { useState, useEffect, useContext } from 'react';
import withScanIndicatorState from '../../../store/hocs/withScanIndicatorState';
import PropTypes from 'prop-types';
import styled from 'styled-components';

import { ToastsContext } from '../../toasts';
import Spinner from '../../common/Spinner';

const Container = styled.div`
  display: flex;
  align-items: center;
  border-radius: ${p => p.theme.radii.md};
  background-color: ${p => p.theme.colors.glassSurface};
  padding: 0.4rem 1rem 0.4rem 0.4rem;
  margin-top: 3px;
  cursor: ${({ isDisabled }) => (isDisabled ? 'auto' : 'pointer')};
  transition: background-color ${p => p.theme.motion.duration.fast} ${p =>
    p.theme.motion.easing.standard};

  &:hover {
    background-color: ${({ theme, isDisabled }) =>
      isDisabled ? theme.colors.glassSurface : theme.colors.glassSurfaceHover};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Label = styled.div`
  font-size: 1.3rem;
  line-height: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-left: 7px;
  color: ${p => p.theme.colors.textPrimary};
`;

const IndicatorLed = styled.div`
  width: 10px;
  height: 10px;
  background-color: ${({ isOnline, syncStatus, theme }) =>
    isOnline
      ? syncStatus === 'failed'
        ? theme.colors.danger
        : theme.colors.brand
      : theme.colors.darkSuccess};
  border: 1px solid ${p => p.theme.colors.textPrimary};
  border-radius: ${p => p.theme.radii.pill};
  margin: 3px;
`;

function ScanIndicator(props) {
  // static propTypes = {
  //   onLabelClick: PropTypes.func.isRequired,
  //   syncStatus: PropTypes.oneOf(['up-to-date', 'syncing', 'failed']).isRequired,
  //   isOnline: PropTypes.bool.isRequired,
  //   tooltip: PropTypes.string,
  //   label: PropTypes.string.isRequired
  // };

  const context = useContext(ToastsContext);

  useEffect(() => {
    if (props.syncStatus === 'failed') {
      context.toast('error', 'Could not refresh');
    }
  }, []);

  return (
    <Container
      isDisabled={props.syncStatus === 'syncing' || !props.isOnline}
      onClick={props.onLabelClick}
      data-rh={props.tooltip}
    >
      {props.isOnline && props.syncStatus === 'syncing' ? (
        <Spinner />
      ) : (
        <IndicatorLed syncStatus={props.syncStatus} isOnline={props.isOnline} />
      )}
      <Label>{props.label}</Label>
    </Container>
  );
}

export default withScanIndicatorState(ScanIndicator);
