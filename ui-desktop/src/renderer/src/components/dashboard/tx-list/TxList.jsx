import React from 'react';
import { List as RVList, AutoSizer } from 'react-virtualized';
import styled, { keyframes } from 'styled-components';

import withTxListState from '../../../store/hocs/withTxListState';
import ScanningTxPlaceholder from './ScanningTxPlaceholder';
import NoTxPlaceholder from './NoTxPlaceholder';
import TxRow from './row/Row';

const Container = styled.div`
  margin-top: 0.8rem;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 1.6rem;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  margin-bottom: 1rem;
`;

const Title = styled.div`
  font-size: 1.9rem;
  line-height: 1;
  white-space: nowrap;
  margin: 0;
  font-weight: 600;
  color: ${(p) => p.theme.colors.morMain};
  cursor: default;
`;

const Count = styled.span`
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const RefreshPill = styled.div`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.45);

  &::before {
    content: '';
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: ${(p) => p.theme.colors.morMain};
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
  }
`;

const ColumnHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 2.4rem 0.8rem 1.6rem;
  font-size: 1.05rem;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.38);

  span:nth-child(1) {
    width: 10%;
    flex-shrink: 0;
  }
  span:nth-child(2) {
    width: 20%;
    flex-shrink: 0;
  }
  span:nth-child(3) {
    width: 40%;
    flex-shrink: 0;
  }
  span:nth-child(4) {
    width: 30%;
    flex-shrink: 0;
  }
`;

const ListContainer = styled.div`
  flex: 1;
  min-height: 160px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  overflow: hidden;
`;

const Center = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const TxRowContainer = styled.div`
  transition: background 0.12s ease;
  &:hover {
    background: rgba(32, 220, 142, 0.06);
  }
`;

export const TxList = ({ transactions, loading, isRefreshing, syncStatus, onReceiveClick }) => {
  const hasRows = +transactions.length > 0;

  const rowRenderer = ({ key, style, index }) => (
    <TxRowContainer style={style} key={`${key}-${transactions[index].hash}`}>
      <TxRow
        data-testid="tx-row"
        data-hash={transactions[index].hash}
        tx={transactions[index]}
      />
    </TxRowContainer>
  );

  return (
    <Container data-testid="tx-list">
      <TitleRow>
        <Title>Recent Activity</Title>
        {hasRows && <Count>{transactions.length}</Count>}
        {isRefreshing && hasRows && <RefreshPill>Updating…</RefreshPill>}
      </TitleRow>

      {hasRows && (
        <ColumnHeader>
          <span>Type</span>
          <span>Action</span>
          <span>Details</span>
          <span>Date</span>
        </ColumnHeader>
      )}

      <ListContainer>
        {!hasRows ? (
          <Center>
            {loading || syncStatus === 'syncing' ? (
              <ScanningTxPlaceholder />
            ) : (
              <NoTxPlaceholder onReceiveClick={onReceiveClick} />
            )}
          </Center>
        ) : (
          <AutoSizer>
            {({ width, height }) => (
              <RVList
                rowRenderer={rowRenderer}
                rowHeight={66}
                rowCount={transactions?.length}
                height={height || 500}
                width={width || 500}
              />
            )}
          </AutoSizer>
        )}
      </ListContainer>
    </Container>
  );
};

export default withTxListState(TxList);
