import PropTypes from 'prop-types';
import styled, { useTheme } from 'styled-components';
import React from 'react';

import LeftArrowIcon from '../../../icons/LeftArrowIcon';
import RightArrowIcon from '../../../icons/RightArrowIcon';
import { ContractIcon } from '../../../icons/ContractIcon';

export const TxIcon = ({ txType, size = '3.6rem' }) => {
  const theme = useTheme();

  if (txType === 'received') {
    return <LeftArrowIcon fill={theme.colors.brand} />;
  }

  if (txType === 'sent') {
    return <RightArrowIcon fill={theme.colors.tertiary} />;
  }

  return (
    <>
      <ContractIcon fill={theme.colors.brand} />
    </>
  );
};
