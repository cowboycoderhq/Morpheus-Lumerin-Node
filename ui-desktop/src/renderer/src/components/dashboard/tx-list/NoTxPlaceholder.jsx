import styled from 'styled-components';
import React from 'react';
import { IconReceipt } from '@tabler/icons-react';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3.2rem;
  text-align: center;

  svg {
    color: rgba(255, 255, 255, 0.18);
    margin-bottom: 1.2rem;
  }
`;

const Label = styled.div`
  line-height: 2.4rem;
  font-size: 1.7rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
`;

const Sub = styled.div`
  margin-top: 0.4rem;
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.35);
`;

export default function NoTxPlaceholder() {
  return (
    <Container data-testid="no-tx-placeholder">
      <IconReceipt size={48} stroke={1.5} />
      <Label>No transactions yet</Label>
      <Sub>Your on-chain activity will appear here.</Sub>
    </Container>
  );
}
