// ============================================================================
// Become a provider.
//
// Two on-chain steps, in a strict order the contracts enforce: register as a
// provider (stakes MOR), then post a bid for a model (costs a bid fee). You
// cannot bid without being an active provider, so the modal only offers the
// second step once the first has happened.
//
// Every constraint shown here is read live from the Diamond, never hardcoded —
// the contracts revert on a bad stake or an out-of-band price, and a reverted
// transaction still costs the user gas. So we check what we can BEFORE
// submitting: enough MOR for the stake/fee, and a price inside the allowed
// band. What we cannot pre-check, we report honestly from the node's error.
// ============================================================================

import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { IconAlertTriangle, IconServer2 } from '@tabler/icons-react';
import { Modal, Btn, Flex } from '../common';
import {
  MarketplaceParams,
  morToWei,
  weiToMor,
} from '../../utils/marketplace';

const Body = styled(Flex.Column)`
  gap: 1.6rem;
  padding: 0.8rem 0.4rem 0.4rem;
  text-align: left;
`;

const Intro = styled.p`
  margin: 0;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textSecondary};
`;

const Field = styled(Flex.Column)`
  gap: 0.6rem;
`;

const Label = styled.label`
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  color: ${(p) => p.theme.colors.textPrimary};
`;

const Hint = styled.span`
  font-size: ${(p) => p.theme.type.xs};
  color: ${(p) => p.theme.colors.textSecondary};
`;

const Input = styled.input`
  width: 100%;
  padding: 1rem 1.2rem;
  font: inherit;
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.textPrimary};
  background: rgba(94, 208, 255, 0.04);
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  border-radius: ${(p) => p.theme.radii.md};

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 1px;
  }
`;

const SelectInput = styled(Input).attrs({ as: 'select' })``;

const Warning = styled(Flex.Row)`
  align-items: flex-start;
  gap: 1rem;
  padding: 1.2rem;
  border-radius: ${(p) => p.theme.radii.md};
  background: rgba(245, 184, 65, 0.1);
  color: ${(p) => p.theme.colors.textPrimary};
  font-size: ${(p) => p.theme.type.xs};
  line-height: 1.5;
`;

const ErrorText = styled.p`
  margin: 0;
  color: ${(p) => p.theme.colors.danger ?? '#ff6b6b'};
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.5;
  word-break: break-word;
`;

type Model = { Id: string; Name: string };

type Props = {
  isOpen: boolean;
  onRequestClose: () => void;
  /** Non-null once this wallet is already a registered provider. */
  existingProvider: unknown | null;
  params: MarketplaceParams | null;
  balanceWei: bigint | null;
  models: Model[];
  onCreateProvider: (args: { stakeWei: bigint; endpoint: string }) => Promise<unknown>;
  onCreateBid: (args: { modelID: string; pricePerSecondWei: bigint }) => Promise<unknown>;
  onDone: () => void;
};

export default function BecomeProviderModal({
  isOpen,
  onRequestClose,
  existingProvider,
  params,
  balanceWei,
  models,
  onCreateProvider,
  onCreateBid,
  onDone,
}: Props) {
  const isProvider = Boolean(existingProvider);

  const [endpoint, setEndpoint] = useState('');
  const [stake, setStake] = useState('');
  const [modelID, setModelID] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the stake to the minimum, once we know what it is.
  useEffect(() => {
    if (params && !stake) setStake(weiToMor(params.providerMinimumStake));
  }, [params]);

  useEffect(() => {
    if (!modelID && models.length) setModelID(models[0].Id);
  }, [models]);

  const submit = async () => {
    setError(null);

    try {
      if (!params) throw new Error('Still loading the marketplace rules — try again in a moment.');

      if (!isProvider) {
        const stakeWei = morToWei(stake);
        if (stakeWei < params.providerMinimumStake) {
          throw new Error(
            `The minimum stake is ${weiToMor(params.providerMinimumStake)} MOR.`,
          );
        }
        if (balanceWei !== null && stakeWei > balanceWei) {
          throw new Error(
            `You have ${weiToMor(balanceWei)} MOR — not enough to stake ${weiToMor(stakeWei)} MOR.`,
          );
        }
        if (!endpoint.trim()) {
          throw new Error('Enter the address other users will reach your node on.');
        }

        setBusy(true);
        await onCreateProvider({ stakeWei, endpoint: endpoint.trim() });
      } else {
        const pricePerSecondWei = morToWei(price);
        if (
          pricePerSecondWei < params.minPricePerSecond ||
          pricePerSecondWei > params.maxPricePerSecond
        ) {
          throw new Error(
            `Price must be between ${weiToMor(params.minPricePerSecond)} and ${weiToMor(
              params.maxPricePerSecond,
            )} MOR per second.`,
          );
        }
        if (balanceWei !== null && params.bidFee > balanceWei) {
          throw new Error(
            `Posting a bid costs a ${weiToMor(params.bidFee)} MOR fee, and you have ${weiToMor(
              balanceWei,
            )} MOR.`,
          );
        }
        if (!modelID) throw new Error('Choose a model to serve.');

        setBusy(true);
        await onCreateBid({ modelID, pricePerSecondWei });
      }

      onDone();
      onRequestClose();
    } catch (e) {
      // Whatever the node/chain said — a revert reason is far more useful than
      // a generic "something went wrong".
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onRequestClose={onRequestClose}
      styleOverrides={{ width: 520, top: '20%' }}
      variant="primary"
      isOpen={isOpen}
      title={isProvider ? 'Serve a model' : 'Become a provider'}
    >
      <Body data-testid="become-provider-modal">
        {!isProvider ? (
          <>
            <Intro>
              Register your node on the network and stake MOR against it. Users
              can then open sessions with you, and you earn for the time you
              serve them.
            </Intro>

            <Field>
              <Label htmlFor="provider-endpoint">Node address</Label>
              <Hint>
                Where users reach your node, as host:port — e.g.
                mynode.example.com:3989. It must be reachable from the internet.
              </Hint>
              <Input
                id="provider-endpoint"
                autoFocus
                value={endpoint}
                placeholder="mynode.example.com:3989"
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </Field>

            <Field>
              <Label htmlFor="provider-stake">Stake (MOR)</Label>
              <Hint>
                {params
                  ? `Minimum ${weiToMor(params.providerMinimumStake)} MOR.`
                  : 'Reading the minimum from the network…'}
                {balanceWei !== null && ` You have ${weiToMor(balanceWei)} MOR.`}
              </Hint>
              <Input
                id="provider-stake"
                value={stake}
                inputMode="decimal"
                onChange={(e) => setStake(e.target.value)}
              />
            </Field>

            <Warning>
              <IconAlertTriangle size={18} stroke={1.75} />
              <span>
                This stakes real MOR on-chain and cannot be undone from here.
                Your stake also caps what you can earn in a year, and you must
                remove every bid before you can deregister.
              </span>
            </Warning>
          </>
        ) : (
          <>
            <Intro>
              You&apos;re registered as a provider. Post a bid to offer a model
              — users pick providers by price and quality, so your price is what
              you charge per second of session time.
            </Intro>

            <Field>
              <Label htmlFor="bid-model">Model</Label>
              <SelectInput
                id="bid-model"
                value={modelID}
                onChange={(e) => setModelID(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.Id} value={m.Id}>
                    {m.Name}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field>
              <Label htmlFor="bid-price">Price per second (MOR)</Label>
              <Hint>
                {params
                  ? `Allowed range ${weiToMor(params.minPricePerSecond)} – ${weiToMor(
                      params.maxPricePerSecond,
                    )} MOR/s. Posting a bid costs a ${weiToMor(params.bidFee)} MOR fee.`
                  : 'Reading the allowed range from the network…'}
              </Hint>
              <Input
                id="bid-price"
                autoFocus
                value={price}
                inputMode="decimal"
                placeholder={params ? weiToMor(params.minPricePerSecond) : '0.00000001'}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>

            <Warning>
              <IconAlertTriangle size={18} stroke={1.75} />
              <span>
                Posting a bid charges a non-refundable fee and replaces any
                existing bid you have for this model.
              </span>
            </Warning>
          </>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <Flex.Row style={{ gap: '1.2rem', justifyContent: 'flex-end' }}>
          <Btn onClick={onRequestClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn onClick={submit} disabled={busy || !params}>
            <Flex.Row align="center" gap="0.6rem">
              <IconServer2 size={16} stroke={1.75} />
              {busy
                ? 'Submitting…'
                : isProvider
                  ? 'Post bid'
                  : 'Register and stake'}
            </Flex.Row>
          </Btn>
        </Flex.Row>
      </Body>
    </Modal>
  );
}
