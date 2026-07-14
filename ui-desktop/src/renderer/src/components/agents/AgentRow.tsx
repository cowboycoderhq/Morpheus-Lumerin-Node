import { AgentUser } from 'src/main/src/client/api.types';
import {
  formatTokenNameValue,
  getAbbreviation,
} from '@renderer/components/agents/utils';
import {
  AgentActionsCell,
  AgentLogo,
  AgentName,
  AgentRow,
  AgentAllowance,
  AgentPermissions,
} from '@renderer/components/agents/AgentRow.styles';
import { Field } from '@renderer/components/agents/Field';
import { useRef, useState } from 'react';
import { useIsOverflow } from '@renderer/hooks/useIsOverflow';
import { Button } from '@renderer/components/agents/Agents.styles';
import Modal from '@renderer/components/common/Modal';
import { Flex } from '@renderer/components/common';
import styled from 'styled-components';
import { useReducedMotion } from 'framer-motion';

const ViewAllButton = styled(Button)`
  margin: 0.5rem 0 0 0;
  padding: 0.4rem 0.8rem;
  height: unset;
  min-height: 32px;
  font-size: ${(p) => p.theme.type.xs};
  line-height: 1.6rem;
`;

const PermissionChip = styled.div`
  padding: 0.3rem 1rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.glassSurfaceHover};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  color: ${(p) => p.theme.colors.textSecondary};
  white-space: nowrap;
`;

const AllowanceValueRow = styled.div`
  display: flex;
  gap: 0.5rem;
  font-family: ${(p) => p.theme.fontMono};

  span:first-child {
    color: ${(p) => p.theme.colors.textSecondary};
  }

  span:last-child {
    color: ${(p) => p.theme.colors.textPrimary};
  }
`;

const cardMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] as const },
};

export const AgentRowComp: React.FC<{
  agent: AgentUser;
  actions: React.ReactNode;
  cfg: { symbol: string; symbolEth: string; morTokenAddress: string };
}> = ({ agent, actions, cfg: props }) => {
  const allowancesRef = useRef<HTMLDivElement>(null);
  const { x, y } = useIsOverflow(allowancesRef);
  const isOverflow = x || y;
  const [isAllowancesModalOpen, setIsAllowancesModalOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <AgentRow
      key={agent.username}
      initial={reduceMotion ? false : cardMotion.initial}
      animate={cardMotion.animate}
      transition={cardMotion.transition}
    >
      <AgentLogo aria-hidden="true">{getAbbreviation(agent.username)}</AgentLogo>
      <AgentName>{agent.username}</AgentName>
      <AgentPermissions>
        <Field title="Permissions">
          <Flex.Row rowwrap gap="0.5rem">
            {agent.perms.map((permission) => (
              <PermissionChip key={permission}>{permission}</PermissionChip>
            ))}
          </Flex.Row>
        </Field>
      </AgentPermissions>
      <AgentAllowance>
        <Field title="Spending allowances" ref={allowancesRef}>
          {isOverflow ||
            Object.entries(agent?.allowances || {}).map(([token, val]) => {
              const { name, value } = formatTokenNameValue(token, val, props);
              return (
                <AllowanceValueRow key={token}>
                  <span>{name}:</span>
                  <span>{value}</span>
                </AllowanceValueRow>
              );
            })}
          {isOverflow && (
            <ViewAllButton onClick={() => setIsAllowancesModalOpen(true)}>
              View all
            </ViewAllButton>
          )}
        </Field>
      </AgentAllowance>
      <AgentActionsCell>{actions}</AgentActionsCell>
      <Modal
        isOpen={isAllowancesModalOpen}
        onRequestClose={() => setIsAllowancesModalOpen(false)}
        variant="primary"
        title={`${agent.username} — spending allowances`}
        styleOverrides={{
          width: '500px',
        }}
      >
        <Flex.Column gap="1rem" style={{ padding: '1.6rem' }}>
          {Object.entries(agent.allowances).map(([token, val]) => {
            const { name, value } = formatTokenNameValue(token, val, props);
            return (
              <AllowanceValueRow key={token}>
                <span>{name}:</span>
                <span>{value}</span>
              </AllowanceValueRow>
            );
          })}
        </Flex.Column>
      </Modal>
    </AgentRow>
  );
};
