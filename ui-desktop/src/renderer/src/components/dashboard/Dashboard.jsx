import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';

import withDashboardState from '../../store/hocs/withDashboardState';

import { ChainHeader } from '../common/ChainHeader';
import BalanceBlock from './BalanceBlock';
import TransactionModal from './tx-modal';
import TxList from './tx-list/TxList';
import { View } from '../common/View';
import { toUSD } from '../../store/utils/syncAmounts';
import { BtnAccent } from './BalanceBlock.styles';
import { queryKeys, computeStakedFunds } from '../../store/queries';

const CustomBtn = styled(BtnAccent)`
  margin-left: 0;
  padding: 1.5rem 1rem;
`;
const WidjetsContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: left;
  gap: 1.6rem;
`;

const WidjetItem = styled.div`
  margin: 1.6rem 0 1.6rem;
  padding: 1.6rem 3.2rem;
  border-radius: 0.375rem;
  color: white;
  max-width: 720px;

  color: white;
`;

const StakingWidjet = styled(WidjetItem)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border-width: 1px;
  border: 1px solid rgba(255, 255, 255, 0.04);
`;

const EMPTY_BALANCE = {
  eth: { value: 0, rate: 0, usd: 0, symbol: 'ETH' },
  mor: { value: 0, rate: 0, usd: 0, symbol: 'MOR' },
};

const Dashboard = ({
  sendDisabled,
  sendDisabledReason,
  syncStatus,
  address,
  copyToClipboard,
  onWalletRefresh,
  getBalances,
  ethCoinPrice,
  loadTransactions,
  getSessionsByUser,
  explorerUrl,
  morTokenAddr,
  ...props
}) => {
  const [activeModal, setActiveModal] = useState(null);

  const onCloseModal = () => setActiveModal(null);
  const onTabSwitch = (modal) => setActiveModal(modal);

  // Cached, stale-while-revalidate data. Revisiting the wallet tab renders the
  // last-known balances/transactions/staked instantly and refreshes silently,
  // instead of the previous refetch-and-block-on-mount behavior.
  const balancesQuery = useQuery({
    queryKey: queryKeys.balances(address),
    queryFn: getBalances,
    enabled: !!address,
    refetchInterval: 30000,
  });

  const transactionsQuery = useQuery({
    queryKey: queryKeys.transactions(address),
    queryFn: () => loadTransactions(1, 15),
    enabled: !!address,
  });

  // Shares the exact cache key/shape used by the Chat tab, so the (expensive,
  // paginated) sessions fetch is reused across tabs.
  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions(address),
    queryFn: () => getSessionsByUser(address),
    enabled: !!address,
  });

  const balanceData = useMemo(() => {
    const data = balancesQuery.data;
    if (!data || !data.balances) {
      return EMPTY_BALANCE;
    }
    const eth = data.balances.eth / 10 ** 18;
    const mor = data.balances.mor / 10 ** 18;
    return {
      eth: {
        value: eth,
        rate: ethCoinPrice,
        usd: toUSD(eth, ethCoinPrice),
        symbol: props.symbolEth,
      },
      mor: {
        value: mor,
        rate: +data.rate,
        usd: toUSD(mor, +data.rate),
        symbol: props.symbol,
      },
    };
  }, [balancesQuery.data, ethCoinPrice, props.symbol, props.symbolEth]);

  const transactions = transactionsQuery.data ?? [];
  const staked = useMemo(
    () => computeStakedFunds(sessionsQuery.data),
    [sessionsQuery.data],
  );

  return (
    <View data-testid="dashboard-container">
      <ChainHeader
        title="My Wallet"
        chain={props.config.chain}
        address={address}
        copyToClipboard={copyToClipboard}
      />

      <BalanceBlock
        {...balanceData}
        sendDisabled={sendDisabled}
        sendDisabledReason={sendDisabledReason}
        onTabSwitch={onTabSwitch}
      />

      <WidjetsContainer>
        <StakingWidjet className="staking">
          <div>Staked Balance</div>
          <div>
            {staked} {props.symbol}
          </div>
        </StakingWidjet>
        <WidjetItem>
          <CustomBtn onClick={() => window.openLink(explorerUrl)} block>
            Transaction Explorer
          </CustomBtn>
        </WidjetItem>
        <WidjetItem>
          <CustomBtn
            onClick={() => window.openLink('https://staking.mor.lumerin.io')}
            block
          >
            Staking Dashboard
          </CustomBtn>
        </WidjetItem>
      </WidjetsContainer>

      <TxList
        loadNextTransactions={() => {}}
        hasTransactions={!!transactions.length}
        syncStatus={syncStatus}
        loading={transactionsQuery.isLoading}
        isRefreshing={transactionsQuery.isFetching}
        transactions={transactions}
      />

      <TransactionModal
        {...balanceData}
        onRequestClose={onCloseModal}
        onTabSwitch={onTabSwitch}
        activeTab={activeModal}
      />
    </View>
  );
};

export default withDashboardState(Dashboard);
