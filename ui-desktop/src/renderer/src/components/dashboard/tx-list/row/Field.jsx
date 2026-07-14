//@ts-check
import React from 'react';
import styled from 'styled-components';

const FieldWithTitle = styled.div`
  flex: 1 1 0;
`;

const FieldTitle = styled.div`
  font-size: 1.3rem;
  font-weight: 500;
  color: ${(p) => p.theme.colors.brand};
`;

// Money surface (B1): transaction amounts/addresses — mono/tabular.
const FieldValue = styled.div`
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.moneySurfaceText};
  font-variant-numeric: tabular-nums;
  text-wrap: nowrap;
`;

export const Field = ({ title, children }) => (
  <FieldWithTitle>
    <FieldTitle>{title}</FieldTitle>
    <FieldValue>{children}</FieldValue>
  </FieldWithTitle>
);
