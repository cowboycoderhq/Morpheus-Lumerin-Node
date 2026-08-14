import { useQuery } from '@tanstack/react-query'
import styled from 'styled-components'
import { LayoutHeader } from '../common/LayoutHeader'
import { View } from '../common/View'
import { Btn } from '../common'
import ProvidersList from './ProvidersList'

import withProvidersState from "../../store/hocs/withProvidersState";
import { queryKeys } from '../../store/queries';

const Subtitle = styled.p`
  margin: -1.6rem 0 2rem;
  max-width: 68rem;
  font-size: ${p => p.theme.type.sm};
  line-height: 1.55;
  color: ${p => p.theme.colors.textSecondary};
`;

const Providers = ({ fetchData, providerId }) => {

    // Cached, stale-while-revalidate: revisiting the Providers tab renders the
    // last result instantly and revalidates in the background instead of
    // re-running the expensive per-session balance fetch on every mount.
    const { data } = useQuery({
        queryKey: queryKeys.providerData(providerId),
        queryFn: () => fetchData(providerId),
        enabled: !!providerId,
    });

    return (
    <View data-testid="models-container">
        <LayoutHeader title="Provider Hub">
            {/* Registration stays disabled. The register / stake / post-a-bid
                on-chain write path is a feature, not a re-skin, so none of it is
                mounted here — this is a label, with no modal and no provider
                write path behind it. */}
            <Btn
              style={{ padding: '1.2rem 2rem' }}
              disabled
              title="Provider registration isn't enabled in this release yet."
              data-testid="become-provider-btn"
            >
              Coming soon
            </Btn>
        </LayoutHeader>
        {/* Single copy for every visitor: telling a provider from a non-provider
            needs the getMyProvider read that belongs to the excluded flow. */}
        <Subtitle>
          Serve AI models to the network and earn MOR for the time you spend
          serving them. Earnings are grouped by model below — open a group to
          see its sessions and claim what you&apos;ve earned.
        </Subtitle>
        <ProvidersList data={data} />
    </View>)
}

export default withProvidersState(Providers);
