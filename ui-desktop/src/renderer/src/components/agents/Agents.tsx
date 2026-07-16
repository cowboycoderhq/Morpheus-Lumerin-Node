import {
  IconInbox,
  IconShieldCheck,
  IconCoins,
  IconPlugConnected,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { LayoutHeader } from '../common/LayoutHeader';
import { View } from '../common/View';
import { TrashIcon } from '@renderer/components/icons/TrashIcon';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import withAgentsState, {
  MappedProps,
  ContainerProps,
} from '@renderer/store/hocs/withAgentsState';
import {
  AgentDelete,
  AgentList,
  Button,
  EmptyState,
  PageIntro,
  SectionHeading,
  SectionHint,
  SubHeader,
  TransactionList,
  TransactionRow,
  TxStateBlock,
  TxStateText,
  ScrollContainer,
} from '@renderer/components/agents/Agents.styles';
import { AgentRowComp } from '@renderer/components/agents/AgentRow';
import { AllowanceRowComp } from '@renderer/components/agents/AllowanceRow';

const Agents = (props: ContainerProps & MappedProps) => {
  const {
    pendingAgents,
    activeAgents,
    allowanceRequests,
    txModal,
    setTxModal,
    handleApproveAccess,
    handleApproveAllowance,
    handleDeleteAgent,
  } = props;

  return (
    <View
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <LayoutHeader title="Agents" />
      <ScrollContainer>
        <PageIntro>
          An <strong>agent</strong> is an app or tool you&apos;ve connected to
          this wallet. Approve access so it can act on your behalf, and
          approve or revoke how much it&apos;s allowed to spend at any time.
        </PageIntro>

        <SectionHeading>
          <SubHeader>Apps waiting for access</SubHeader>
          <SectionHint>
            Review each request before approving — this lets the app act on
            your behalf.
          </SectionHint>
        </SectionHeading>
        <AgentList>
          {pendingAgents.length === 0 && (
            <EmptyState>
              <IconShieldCheck size={28} stroke={1.5} />
              <span>No access requests right now.</span>
            </EmptyState>
          )}
          {pendingAgents.map((agent) => (
            <AgentRowComp
              key={agent.username}
              agent={agent}
              cfg={{
                symbol: props.symbol,
                symbolEth: props.symbolEth,
                morTokenAddress: props.morTokenAddress,
              }}
              actions={
                <>
                  <Button onClick={() => handleApproveAccess(agent, true)}>
                    Approve access
                  </Button>
                  <AgentDelete
                    onClick={() => handleApproveAccess(agent, false)}
                    aria-label={`Deny access for ${agent.username}`}
                  >
                    <TrashIcon fill="currentColor" width="1.8rem" />
                  </AgentDelete>
                </>
              }
            />
          ))}
        </AgentList>

        <SectionHeading>
          <SubHeader>Spending limit requests</SubHeader>
          <SectionHint>
            These apps are asking to spend more without asking you every time.
          </SectionHint>
        </SectionHeading>
        <AgentList>
          {allowanceRequests.length === 0 && (
            <EmptyState>
              <IconCoins size={28} stroke={1.5} />
              <span>No spending limit requests right now.</span>
            </EmptyState>
          )}
          {allowanceRequests.map((agent) => (
            <AllowanceRowComp
              key={`${agent.username}-${agent.token}`}
              agent={{
                token: agent.token,
                allowance: agent.allowance,
                username: agent.username,
              }}
              props={{
                symbol: props.symbol,
                symbolEth: props.symbolEth,
                morTokenAddress: props.morTokenAddress,
              }}
              actions={
                <>
                  <Button onClick={() => handleApproveAllowance(agent, true)}>
                    Approve allowance
                  </Button>
                  <AgentDelete
                    onClick={() => handleApproveAllowance(agent, false)}
                    aria-label={`Deny allowance request for ${agent.username}`}
                  >
                    <TrashIcon fill="currentColor" width="1.8rem" />
                  </AgentDelete>
                </>
              }
            />
          ))}
        </AgentList>

        <SectionHeading>
          <SubHeader>Connected apps</SubHeader>
          <SectionHint>
            Apps that already have access to your wallet. Remove one to
            revoke its access.
          </SectionHint>
        </SectionHeading>
        <AgentList>
          {activeAgents.length === 0 && (
            <EmptyState>
              <IconPlugConnected size={28} stroke={1.5} />
              <span>No connected apps yet.</span>
            </EmptyState>
          )}
          {activeAgents.map((agent) => (
            <AgentRowComp
              key={agent.username}
              agent={agent}
              cfg={{
                symbol: props.symbol,
                symbolEth: props.symbolEth,
                morTokenAddress: props.morTokenAddress,
              }}
              actions={
                <>
                  <Button
                    onClick={() =>
                      setTxModal({
                        state: 'loading',
                        agentName: agent.username,
                      })
                    }
                  >
                    Transactions
                  </Button>
                  <AgentDelete
                    onClick={() => handleDeleteAgent(agent)}
                    aria-label={`Remove ${agent.username}`}
                  >
                    <TrashIcon fill="currentColor" width="1.8rem" />
                  </AgentDelete>
                </>
              }
            />
          ))}
        </AgentList>
      </ScrollContainer>
      <Modal
        isOpen={txModal.state !== 'pending'}
        onRequestClose={() => setTxModal({ state: 'pending' })}
        variant="primary"
        title="Transaction history"
      >
        {txModal.state === 'loading' && (
          <TxStateBlock>
            <Spinner size="24px" />
            <TxStateText>Loading transactions…</TxStateText>
          </TxStateBlock>
        )}
        {txModal.state === 'error' && (
          <TxStateBlock>
            <IconAlertTriangle size={28} stroke={1.5} />
            <TxStateText>
              We couldn&apos;t load this agent&apos;s transaction history.
              Close this and try again.
            </TxStateText>
          </TxStateBlock>
        )}
        {txModal.state === 'success' && txModal.data.length === 0 && (
          <TxStateBlock>
            <IconInbox size={28} stroke={1.5} />
            <TxStateText>No transactions yet for this agent.</TxStateText>
          </TxStateBlock>
        )}
        {txModal.state === 'success' && txModal.data.length > 0 && (
          <TransactionList>
            {txModal.data.map((tx) => {
              return (
                <TransactionRow key={tx}>
                  <a target="_blank" href={props.txUrlResolver(tx)}>
                    {tx}
                  </a>
                </TransactionRow>
              );
            })}
          </TransactionList>
        )}
      </Modal>
    </View>
  );
};

export default withAgentsState(Agents);
