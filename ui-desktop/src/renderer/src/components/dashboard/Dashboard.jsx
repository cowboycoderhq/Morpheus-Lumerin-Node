import React, { useState, useMemo, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconCopy,
  IconExternalLink,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconChartBar,
  IconLock,
} from '@tabler/icons-react';

import withDashboardState from '../../store/hocs/withDashboardState';

import TransactionModal from './tx-modal';
import TxList from './tx-list/TxList';
import { View } from '../common/View';
import { toUSD } from '../../store/utils/syncAmounts';
import { queryKeys, computeStakedFunds } from '../../store/queries';
import { ToastsContext } from '../toasts';
import { abbreviateAddress } from '../../utils';
import BaseLogo from '../icons/BaseLogo';
import { MorpheusLogo } from '../icons/MorpheusLogo';
import { EtherIcon } from '../icons/EtherIcon';

const EMPTY_BALANCE = {
  eth: { value: 0, rate: 0, usd: 0, symbol: 'ETH' },
  mor: { value: 0, rate: 0, usd: 0, symbol: 'MOR' },
};

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// Reflects a real in-flight fetch (isFetching), not decorative ambient loop —
// still honors reduced-motion below (B5).
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
`;

const Page = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

/* ---- Header ---- */
const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
  flex-wrap: wrap;
  padding-bottom: 1.6rem;
`;

const TitleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
`;

const PageTitle = styled.h1`
  margin: 0;
  font-size: 2.4rem;
  line-height: 1;
  font-weight: 600;
  color: ${(p) => p.theme.colors.brand};
`;

const ChainBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: ${(p) => p.theme.colors.textPrimary};
  font-size: 1.2rem;
  padding: 0.5rem 1rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

// Money surface (B1): shows the wallet address — solid/opaque, mono, no
// glass/glow (distinct from the sidebar's AddressHeader glass treatment).
const AddressPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0.6rem 0.7rem 0.6rem 1.2rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.moneySurfaceBg};
  border: 1px solid ${(p) => p.theme.colors.moneySurfaceBorder};
  color: ${(p) => p.theme.colors.moneySurfaceText};
  font-family: ${(p) => p.theme.fontMono};
  font-size: 1.3rem;
  font-variant-numeric: tabular-nums;
`;

const AddressDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.brand};
  box-shadow: 0 0 0 3px ${(p) => p.theme.colors.brandTint(0.18)};
`;

const IconBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  min-width: 40px;
  min-height: 40px;
  margin: -5px;
  border-radius: ${(p) => p.theme.radii.pill};
  border: none;
  background: transparent;
  color: ${(p) => p.theme.colors.textSecondary};
  cursor: pointer;
  transition: background ${(p) => p.theme.motion.duration.fast} ${(p) =>
    p.theme.motion.easing.standard},
    color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover {
    background: ${(p) => p.theme.colors.brandTint(0.14)};
    color: ${(p) => p.theme.colors.brand};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/* ---- Balance hero ---- */
const HeroGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.6rem;
`;

// Money surface (B1): live coin balances — solid/opaque background, no
// gradient/glow. The primary token is distinguished with a brand border only.
const TokenCard = styled.div`
  position: relative;
  overflow: hidden;
  border-radius: ${(p) => p.theme.radii.lg};
  padding: 1.4rem 1.8rem;
  background: ${(p) => p.theme.colors.moneySurfaceBg};
  border: 1px solid
    ${(p) => (p.$accent ? p.theme.colors.brand : p.theme.colors.moneySurfaceBorder)};
  animation: ${fadeUp} ${(p) => p.theme.motion.duration.slow} ${(p) =>
    p.theme.motion.easing.enter} both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const TokenHead = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

// The MOR chip ($accent): just the wings, white and a size up — no disc, no texture.
const TokenBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: ${(p) => p.theme.radii.pill};
  flex-shrink: 0;
  /* The wings stay white in both looks — it's a brand mark, not a themed
     surface — but read it from the token so no literal hides in here. */
  color: ${(p) => (p.$accent ? p.theme.colors.light : p.theme.colors.textPrimary)};
  background: ${(p) =>
    p.$accent ? 'transparent' : p.theme.colors.voidElevated};
`;

const TokenName = styled.div`
  display: flex;
  flex-direction: column;
`;

const TokenSymbol = styled.span`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.textPrimary};
  letter-spacing: 0.3px;
`;

const TokenSub = styled.span`
  font-size: 1.1rem;
  color: ${(p) => p.theme.colors.textMuted};
`;

const LiveDot = styled.span`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 1rem;
  color: ${(p) => p.theme.colors.textMuted};

  &::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: ${(p) => p.theme.radii.pill};
    background: ${(p) => p.theme.colors.brand};
    animation: ${pulse} 1.1s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
    }
  }
`;

// The headline balance figure — always mono/tabular (money surface).
const TokenBalance = styled.div`
  font-family: ${(p) => p.theme.fontMono};
  font-size: 2.7rem;
  line-height: 1.05;
  font-weight: 600;
  color: ${(p) => p.theme.colors.moneySurfaceText};
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
`;

const TokenUnit = styled.span`
  font-family: ${(p) => p.theme.fontMono};
  font-size: 1.6rem;
  font-weight: 500;
  color: ${(p) => p.theme.colors.textSecondary};
  margin-left: 6px;
`;

const TokenUsd = styled.div`
  font-family: ${(p) => p.theme.fontMono};
  margin-top: 0.6rem;
  font-size: 1.35rem;
  color: ${(p) => p.theme.colors.textSecondary};
  font-variant-numeric: tabular-nums;
`;

/* ---- Stats / actions ---- */
const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.6rem;
  margin: 1.2rem 0;
`;

// Money surface (B1): staked balance is a live fund figure.
const StatCard = styled.div`
  display: flex;
  align-items: center;
  gap: 1.4rem;
  padding: 1.6rem 1.8rem;
  border-radius: ${(p) => p.theme.radii.lg};
  background: ${(p) => p.theme.colors.moneySurfaceBg};
  border: 1px solid ${(p) => p.theme.colors.moneySurfaceBorder};
`;

const StatIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: ${(p) => p.theme.radii.md};
  flex-shrink: 0;
  color: ${(p) => p.theme.colors.brand};
  background: ${(p) => p.theme.colors.voidElevated};
`;

const StatText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const StatLabel = styled.span`
  font-size: 1.15rem;
  color: ${(p) => p.theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.6px;
`;

const StatValue = styled.span`
  font-family: ${(p) => p.theme.fontMono};
  font-size: 1.9rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.moneySurfaceText};
  font-variant-numeric: tabular-nums;
`;

// Navigation actions (Receive / Staking Dashboard) — not a money surface, so
// the app's usual glass chrome applies.
const ActionTile = styled.button`
  display: flex;
  align-items: center;
  gap: 1.4rem;
  padding: 1.6rem 1.8rem;
  border-radius: ${(p) => p.theme.radii.lg};
  text-align: left;
  cursor: pointer;
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  color: ${(p) => p.theme.colors.textPrimary};
  min-height: 40px;
  transition: background ${(p) => p.theme.motion.duration.base} ${(p) =>
    p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.base} ${(p) =>
      p.theme.motion.easing.standard},
    transform ${(p) => p.theme.motion.duration.base} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover,
  &:focus-visible {
    background: ${(p) => p.theme.colors.glassSurfaceHover};
    border-color: ${(p) => p.theme.colors.brand};
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover,
    &:focus-visible {
      transform: none;
    }
  }
`;

const ActionText = styled.div`
  display: flex;
  flex-direction: column;
`;

const ActionTitle = styled.span`
  font-size: 1.5rem;
  font-weight: 600;
`;

const ActionSub = styled.span`
  font-size: 1.1rem;
  color: ${(p) => p.theme.colors.textMuted};
`;

const formatAmount = (value, maxFrac = 4) => {
  const n = Number(value) || 0;
  if (n === 0) return '0';
  if (n > 0 && n < 0.0001) return '< 0.0001';
  return new Intl.NumberFormat(navigator.language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  }).format(n);
};

const formatUsd = (usd) => (usd && usd !== 0 ? `≈ ${usd}` : '≈ $0.00');

const Dashboard = ({
  syncStatus,
  address,
  copyToClipboard,
  getBalances,
  ethCoinPrice,
  loadTransactions,
  getSessionsByUser,
  explorerUrl,
  ...props
}) => {
  // Another screen can ask the wallet to open straight into a view — Chat sends
  // a user with no MOR here with `openModal: 'receive'`, so they land on the
  // address/QR they actually need instead of the wallet's front page.
  const location = useLocation();
  const [activeModal, setActiveModal] = useState(
    location.state?.openModal ?? null,
  );
  const context = useContext(ToastsContext);

  const queryClient = useQueryClient();

  const onCloseModal = () => setActiveModal(null);

  const onTabSwitch = (modal) => {
    setActiveModal(modal);

    // A completed transfer changes BOTH the balance and the activity list, and
    // nothing invalidated either cache — so a send you had just made did not
    // appear in Recent Activity and the balance stayed stale. Refresh on
    // success, then again as the router indexes the tx (it is not queryable the
    // instant it is broadcast).
    if (modal === 'success') {
      const refresh = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(address) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactions(address),
        });
      };
      refresh();
      setTimeout(refresh, 4000);
      setTimeout(refresh, 12000);
    }
  };

  // Cached, stale-while-revalidate data. Revisiting the wallet tab renders the
  // last-known balances/transactions/staked instantly and refreshes silently.
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

  const { eth, mor } = balanceData;
  const balancesLive = balancesQuery.isFetching;
  const morSymbol = mor.symbol || 'MOR';
  const ethSymbol = eth.symbol || 'ETH';
  const explorerHost = explorerUrl ? new URL(explorerUrl).hostname : 'explorer';

  const handleCopy = () => {
    if (!address) return;
    copyToClipboard(address);
    context.toast('info', 'Address copied to clipboard', { autoClose: 1500 });
  };

  return (
    <View data-testid="dashboard-container">
      <Page>
        <TopBar>
          <TitleGroup>
            <PageTitle>My Wallet</PageTitle>
            <ChainBadge>
              <BaseLogo style={{ width: '18px' }} />
              {props.config?.chain?.displayName || 'Base'}
            </ChainBadge>
          </TitleGroup>

          {address && (
            <AddressPill>
              <AddressDot />
              {abbreviateAddress(address, 6)}
              <IconBtn title="Copy address" onClick={handleCopy}>
                <IconCopy size={16} />
              </IconBtn>
              <IconBtn
                title={`View on ${explorerHost}`}
                onClick={() => explorerUrl && window.openLink(explorerUrl)}
              >
                <IconExternalLink size={16} />
              </IconBtn>
            </AddressPill>
          )}
        </TopBar>

        <HeroGrid>
          <TokenCard $accent>
            <TokenHead>
              <TokenBadge $accent>
                <MorpheusLogo style={{ width: '34px', height: '34px' }} />
              </TokenBadge>
              <TokenName>
                <TokenSymbol>{morSymbol}</TokenSymbol>
                <TokenSub>Morpheus</TokenSub>
              </TokenName>
              {balancesLive && <LiveDot>live</LiveDot>}
            </TokenHead>
            <TokenBalance>
              {formatAmount(mor.value, 4)}
              <TokenUnit>{morSymbol}</TokenUnit>
            </TokenBalance>
            <TokenUsd>{formatUsd(mor.usd)}</TokenUsd>
          </TokenCard>

          <TokenCard>
            <TokenHead>
              <TokenBadge>
                <EtherIcon size="22px" />
              </TokenBadge>
              <TokenName>
                <TokenSymbol>{ethSymbol}</TokenSymbol>
                <TokenSub>Ethereum</TokenSub>
              </TokenName>
              {balancesLive && <LiveDot>live</LiveDot>}
            </TokenHead>
            <TokenBalance>
              {formatAmount(eth.value, 5)}
              <TokenUnit>{ethSymbol}</TokenUnit>
            </TokenBalance>
            <TokenUsd>{formatUsd(eth.usd)}</TokenUsd>
          </TokenCard>
        </HeroGrid>

        <StatsRow>
          <StatCard>
            <StatIcon>
              <IconLock size={22} />
            </StatIcon>
            <StatText>
              <StatLabel>Staked Balance</StatLabel>
              <StatValue>
                {staked} {morSymbol}
              </StatValue>
            </StatText>
          </StatCard>

          <ActionTile onClick={() => onTabSwitch('send')} data-testid="send-tile">
            <StatIcon>
              <IconArrowUpRight size={22} />
            </StatIcon>
            <ActionText>
              <ActionTitle>Send</ActionTitle>
              <ActionSub>Transfer {morSymbol} or ETH</ActionSub>
            </ActionText>
          </ActionTile>

          <ActionTile onClick={() => onTabSwitch('receive')}>
            <StatIcon>
              <IconArrowDownLeft size={22} />
            </StatIcon>
            <ActionText>
              <ActionTitle>Receive</ActionTitle>
              <ActionSub>Show address & QR</ActionSub>
            </ActionText>
          </ActionTile>

          <ActionTile
            onClick={() => window.openLink('https://staking.mor.lumerin.io')}
          >
            <StatIcon>
              <IconChartBar size={22} />
            </StatIcon>
            <ActionText>
              <ActionTitle>Staking Dashboard</ActionTitle>
              <ActionSub>staking.mor.lumerin.io</ActionSub>
            </ActionText>
          </ActionTile>
        </StatsRow>

        <TxList
          loadNextTransactions={() => {}}
          hasTransactions={!!transactions.length}
          syncStatus={syncStatus}
          loading={transactionsQuery.isLoading}
          isRefreshing={transactionsQuery.isFetching}
          transactions={transactions}
          onReceiveClick={() => onTabSwitch('receive')}
        />
      </Page>

      <TransactionModal
        {...balanceData}
        onRequestClose={onCloseModal}
        onTabSwitch={onTabSwitch}
        activeTab={activeModal}
        address={address}
        copyToClipboard={copyToClipboard}
        explorerUrl={explorerUrl}
      />
    </View>
  );
};

export default withDashboardState(Dashboard);
