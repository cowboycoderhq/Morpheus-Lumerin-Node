import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import styled from 'styled-components'
import { LayoutHeader } from '../common/LayoutHeader'
import { View } from '../common/View'
import { Btn } from '../common'
import ProvidersList from './ProvidersList'
import BecomeProviderModal from './BecomeProviderModal'
import type { MarketplaceParams } from '../../utils/marketplace'

import withProvidersState from "../../store/hocs/withProvidersState";
import { queryKeys } from '../../store/queries';

const Subtitle = styled.p`
  margin: -1.6rem 0 2rem;
  max-width: 68rem;
  font-size: ${p => p.theme.type.sm};
  line-height: 1.55;
  color: ${p => p.theme.colors.textSecondary};
`;

const Providers = ({
  fetchData,
  providerId,
  getMarketplaceParams,
  getMorBalanceWei,
  getMyProvider,
  getAllModels,
  createProvider,
  createBid,
}) => {
    const queryClient = useQueryClient();
    const [isModalOpen, setModalOpen] = useState(false);

    // Cached, stale-while-revalidate: revisiting the Providers tab renders the
    // last result instantly and revalidates in the background instead of
    // re-running the expensive per-session balance fetch on every mount.
    const { data } = useQuery({
        queryKey: queryKeys.providerData(providerId),
        queryFn: () => fetchData(providerId),
        enabled: !!providerId,
    });

    // Whether this wallet is already a provider decides which step the modal
    // opens on — the contracts reject a bid from an unregistered provider, so
    // the UI must not offer one.
    const { data: myProvider } = useQuery({
        queryKey: ['my-provider', providerId],
        queryFn: () => getMyProvider(providerId),
        enabled: !!providerId,
    });

    // The stake/fee/price rules and the wallet balance are only needed once the
    // user actually opens the dialog.
    const { data: params } = useQuery<MarketplaceParams>({
        queryKey: ['marketplace-params'],
        queryFn: getMarketplaceParams,
        enabled: isModalOpen,
        staleTime: 5 * 60 * 1000,
    });

    const { data: balanceWei } = useQuery<bigint>({
        queryKey: ['mor-balance-wei', providerId],
        queryFn: getMorBalanceWei,
        enabled: isModalOpen && !!providerId,
    });

    const { data: models } = useQuery<{ Id: string; Name: string }[]>({
        queryKey: ['all-models'],
        queryFn: getAllModels,
        enabled: isModalOpen,
    });

    const isProvider = Boolean(myProvider);

    return (
    <View data-testid="models-container">
        <LayoutHeader title="Provider Hub">
            {/* Provider registration (register/stake/post-a-bid) is disabled for
                distribution: the on-chain write path has not been verified end to
                end. Re-enable by restoring the onClick + label below once the flow
                is proven (e.g. on Base Sepolia). The modal stays mounted but
                unreachable — nothing else sets isModalOpen, so no provider query
                or on-chain action can fire. */}
            <Btn
              style={{ padding: '1.2rem 2rem' }}
              disabled
              title="Provider registration isn't enabled in this release yet."
              data-testid="become-provider-btn"
            >
              Coming soon
            </Btn>
        </LayoutHeader>
        <Subtitle>
          {isProvider
            ? "Earnings from AI models you serve, grouped by model. Open a group to see its sessions and claim what you've earned."
            : 'Serve AI models to the network and earn MOR for the time you spend serving them. Registering stakes MOR on-chain.'}
        </Subtitle>
        <ProvidersList data={data} />

        <BecomeProviderModal
          isOpen={isModalOpen}
          onRequestClose={() => setModalOpen(false)}
          existingProvider={myProvider ?? null}
          params={params ?? null}
          balanceWei={balanceWei ?? null}
          models={models ?? []}
          onCreateProvider={createProvider}
          onCreateBid={createBid}
          onDone={() => {
            // Registering or bidding changes on-chain state the rest of this
            // page renders from — drop the caches so it reflects reality.
            queryClient.invalidateQueries({ queryKey: ['my-provider', providerId] });
            queryClient.invalidateQueries({ queryKey: queryKeys.providerData(providerId) });
            queryClient.invalidateQueries({ queryKey: ['mor-balance-wei', providerId] });
          }}
        />
    </View>)
}

export default withProvidersState(Providers);
