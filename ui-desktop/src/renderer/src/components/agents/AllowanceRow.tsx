import { useReducedMotion } from 'framer-motion';
import {
  AgentActionsCell,
  AgentLogo,
  AgentName,
} from '@renderer/components/agents/AgentRow.styles';
import {
  AgentAllowanceToken,
  AgentAllowanceValue,
  AllowanceRow,
  MonoText,
} from '@renderer/components/agents/AllowanceRow.styles';
import { Field } from '@renderer/components/agents/Field';
import {
  formatTokenNameValue,
  getAbbreviation,
} from '@renderer/components/agents/utils';

const cardMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] as const },
};

export const AllowanceRowComp: React.FC<{
  agent: { username: string; token: string; allowance: string };
  actions: React.ReactNode;
  props: { symbol: string; symbolEth: string; morTokenAddress: string };
}> = ({ agent, actions, props }) => {
  const { name, value } = formatTokenNameValue(
    agent.token,
    agent.allowance,
    props,
  );
  const reduceMotion = useReducedMotion();

  return (
    <AllowanceRow
      key={agent.username}
      initial={reduceMotion ? false : cardMotion.initial}
      animate={cardMotion.animate}
      transition={cardMotion.transition}
    >
      <AgentLogo aria-hidden="true">{getAbbreviation(agent.username)}</AgentLogo>
      <AgentName>{agent.username}</AgentName>
      <AgentAllowanceToken>
        <Field title="Token" children={<MonoText>{name}</MonoText>} />
      </AgentAllowanceToken>
      <AgentAllowanceValue>
        <Field
          title="Requested allowance"
          children={<MonoText>{value}</MonoText>}
        />
      </AgentAllowanceValue>

      <AgentActionsCell>{actions}</AgentActionsCell>
    </AllowanceRow>
  );
};
