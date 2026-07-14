// ============================================================================
// Provider Hub — session list.
//
// Purely presentational: groups the sessions `withProvidersState` already
// fetched by the AI model they belong to, and renders each group as a
// collapsible Aurora card. No data-fetching, filtering math, or claim logic
// lives here beyond what the previous bootstrap Accordion/Table version did.
// ============================================================================

import { useState } from 'react';
import styled from 'styled-components';
import { motion, useReducedMotion } from 'framer-motion';
import { IconChevronDown, IconChevronRight, IconInbox } from '@tabler/icons-react';

import withProvidersState from '../../store/hocs/withProvidersState';
import { abbreviateAddress } from '../../utils';
import { Btn, Flex } from '../common';

const GRID_COLUMNS = '1.3fr 1.3fr 0.9fr 1fr 0.9fr';

const Container = styled.div`
  height: 75vh;
  overflow-y: auto;
  padding: 0.4rem 0.4rem 2.4rem 0;
`;

const Intro = styled.p`
  margin: 0 0 2rem;
  max-width: 68rem;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textSecondary};
`;

const ModelCard = styled(motion.div)`
  margin-bottom: 1.6rem;
  border-radius: ${(p) => p.theme.radii.lg};
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  overflow: hidden;
`;

const ModelHeader = styled.button`
  border-radius: ${(p) => p.theme.radii.md};
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 40px;
  padding: 1.6rem 2rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: ${(p) => p.theme.colors.textPrimary};
  transition: background ${(p) => p.theme.motion.duration.fast} ${(p) =>
    p.theme.motion.easing.standard};

  &:hover,
  &:focus-visible {
    background: ${(p) => p.theme.colors.glassSurfaceHover};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ModelName = styled.span`
  font-size: ${(p) => p.theme.type.md};
  font-weight: 600;
`;

const SessionCountPill = styled.span`
  padding: 0.4rem 1rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: rgba(94, 208, 255, 0.1);
  color: ${(p) => p.theme.colors.brand};
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 600;
  white-space: nowrap;
`;

const ModelBody = styled.div<{ $open: boolean }>`
  display: ${(p) => (p.$open ? 'block' : 'none')};
  border-top: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

const TableHead = styled.div`
  display: grid;
  grid-template-columns: ${GRID_COLUMNS};
  gap: 0.8rem;
  padding: 1.2rem 2rem;
  font-size: ${(p) => p.theme.type.xs};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textMuted};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: ${GRID_COLUMNS};
  gap: 0.8rem;
  align-items: center;
  padding: 1.2rem 2rem;

  &:not(:last-child) {
    border-bottom: 1px solid ${(p) => p.theme.colors.glassBorder};
  }
`;

const Cell = styled.span`
  font-family: ${(p) => p.theme.fontMono};
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StatusPill = styled.span<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  padding: 0.3rem 1rem;
  border-radius: ${(p) => p.theme.radii.pill};
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 700;
  letter-spacing: 0.04em;
  color: ${(p) => (p.$open ? p.theme.colors.brand : p.theme.colors.textMuted)};
  background: ${(p) =>
    p.$open ? 'rgba(94, 208, 255, 0.12)' : p.theme.colors.glassSurface};
  border: 1px solid
    ${(p) => (p.$open ? 'transparent' : p.theme.colors.glassBorder)};
`;

const ClaimButton = styled(Btn)`
  padding: 0.7rem 1.6rem;
  min-height: 32px;
  line-height: 1.6rem;
  font-size: ${(p) => p.theme.type.xs};
`;

const EmptyRow = styled.div`
  padding: 2.4rem 2rem;
  text-align: center;
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.textMuted};
`;

const EmptyState = styled(Flex.Column)`
  align-items: center;
  gap: 1.2rem;
  padding: 4.8rem 2rem;
  text-align: center;
  color: ${(p) => p.theme.colors.textSecondary};
  font-size: ${(p) => p.theme.type.sm};
`;

type Session = {
  Id: string;
  BidID: string;
  ClosedAt?: string | number | null;
  Balance: number;
  ModelAgentId: string;
};

function ModelSection({
  modelName,
  sessions,
  onClaim,
}: {
  modelName: string;
  sessions: Session[];
  onClaim: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const Caret = open ? IconChevronDown : IconChevronRight;

  return (
    <ModelCard
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <ModelHeader
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Flex.Row align="center" gap="1.2rem">
          <Caret size={18} stroke={2} />
          <ModelName>{modelName}</ModelName>
        </Flex.Row>
        <SessionCountPill>
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
        </SessionCountPill>
      </ModelHeader>
      <ModelBody $open={open}>
        {sessions.length ? (
          <>
            <TableHead>
              <span>Session ID</span>
              <span>Bid ID</span>
              <span>Status</span>
              <span>Balance</span>
              <span />
            </TableHead>
            {sessions.map((b) => (
              <Row key={b.Id}>
                <Cell>{abbreviateAddress(b.Id, 5)}</Cell>
                <Cell>{abbreviateAddress(b.BidID, 5)}</Cell>
                <StatusPill $open={!b.ClosedAt}>
                  {b.ClosedAt ? 'Closed' : 'Open'}
                </StatusPill>
                <Cell>{b.Balance / 10 ** 18} MOR</Cell>
                <span>
                  {!b.ClosedAt && (
                    <ClaimButton onClick={() => onClaim(b.Id)}>
                      Claim
                    </ClaimButton>
                  )}
                </span>
              </Row>
            ))}
          </>
        ) : (
          <EmptyRow>No sessions yet for this model.</EmptyRow>
        )}
      </ModelBody>
    </ModelCard>
  );
}

function ProvidersList({ data, claimFunds }) {
  const modelsNames = data?.modelsNames;
  const modelIds = modelsNames ? Object.keys(modelsNames) : [];

  return (
    <Container>
      <Intro>
        A <strong>provider session</strong> is created whenever someone rents
        compute from an AI model you serve. Sessions are grouped below by
        model — open a group to see its sessions, then hit{' '}
        <strong>Claim</strong> to move an open session&apos;s earned balance to
        your wallet.
      </Intro>
      {modelIds.length ? (
        modelIds.map((model) => {
          const modelSessions = data.results.filter(
            (r) => r.ModelAgentId.toLowerCase() == model.toLowerCase(),
          );

          return (
            <ModelSection
              key={model}
              modelName={modelsNames[model]}
              sessions={modelSessions}
              onClaim={claimFunds}
            />
          );
        })
      ) : (
        <EmptyState>
          <IconInbox size={40} stroke={1.5} />
          <span>
            No provider sessions yet. Once someone rents compute from a model
            you serve, sessions will show up here, grouped by model.
          </span>
        </EmptyState>
      )}
    </Container>
  );
}

export default withProvidersState(ProvidersList);
