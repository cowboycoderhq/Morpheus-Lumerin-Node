import { LayoutHeader } from '../common/LayoutHeader';
import { View } from '../common/View';
import { Btn, Flex, Modal, Tabs, TextInput } from '../common';
import withSettingsState from '../../store/hocs/withSettingsState';
import { useContext, useEffect, useState } from 'react';
import {
  IconPalette,
  IconRouter,
  IconServerCog,
  IconTrash,
} from '@tabler/icons-react';
import { Client } from 'src/renderer/src/client';
import { StartupItemComponent } from '@renderer/components/StartupItem';
import withServicesState from '@renderer/store/hocs/withServicesState';
import { LoadingState } from 'src/main/orchestrator/orchestrator.types';
import { ToastsContext } from '@renderer/components/toasts';
import { THEME_VARIANTS, ThemeVariant } from '../../ui/theme';
import { useThemeVariant } from '../../ui/ThemeVariantContext';
import {
  ConfirmActions,
  ConfirmBody,
  ConfirmMessage,
  DangerBtn,
  FieldRow,
  GhostBtn,
  SectionCard,
  SectionDescription,
  SectionHeader,
  SettingsCallout,
  ToggleInput,
  ToggleLabel,
  ToggleRow,
} from './Settings.styles';

const THEME_LABELS: Record<ThemeVariant, string> = {
  aurora: 'Aurora',
  classic: 'Classic',
};

type CommonProps = {
  client: Client;
  getConfig: () => Promise<{
    DerivedConfig: { EthNodeURLs: string[] };
  }>;
  logout: () => Promise<void>;
  updateEthNodeUrl: (url: string) => Promise<void>;
  updateFailoverSetting: (setting: boolean) => Promise<void>;
};

const Common = (props: CommonProps) => {
  const [ethNodeUrl, setEthUrl] = useState<string>('');
  const [useFailover, setUseFailover] = useState<boolean>(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const { variant, setVariant } = useThemeVariant();

  useEffect(() => {
    (async () => {
      const cfg = await props.getConfig();
      const customUrl = cfg?.DerivedConfig?.EthNodeURLs[0] || '';
      setEthUrl(customUrl);
      const failoverSettings = (await props.client.getFailoverSetting()) as
        | { isEnabled?: boolean }
        | undefined;
      setUseFailover(Boolean(failoverSettings?.isEnabled));
    })();
  }, []);

  return (
    <>
      {/* The only way to reach the theme swap. It leads because it is the one
          harmless thing on this tab — everything below it resets a wallet or
          repoints a node. */}
      <SectionCard>
        <Flex.Row align="center" gap="0.8rem">
          <IconPalette size={20} stroke={1.75} color="currentColor" />
          <SectionHeader>Appearance</SectionHeader>
        </Flex.Row>
        <SectionDescription>
          Choose how the app looks. Aurora is the futuristic cyan/glass theme;
          Classic is the calm Morpheus green. You can switch anytime.
        </SectionDescription>
        <Flex.Row gap="0.8rem">
          {THEME_VARIANTS.map((v) => {
            const active = v === variant;
            const ThemeBtn = active ? Btn : GhostBtn;
            return (
              <ThemeBtn
                key={v}
                data-testid={`theme-${v}`}
                aria-pressed={active}
                onClick={() => setVariant(v)}
              >
                {active ? `✓ ${THEME_LABELS[v]}` : THEME_LABELS[v]}
              </ThemeBtn>
            );
          })}
        </Flex.Row>
      </SectionCard>

      <SectionCard>
        <Flex.Row align="center" gap="0.8rem">
          <IconTrash size={20} stroke={1.75} color="currentColor" />
          <SectionHeader>Reset Wallet</SectionHeader>
        </Flex.Row>
        <SectionDescription>
          Remove this wallet from this device and set one up from scratch. This
          does not touch any funds on-chain — but without your recovery phrase,
          you won&apos;t be able to get back into this wallet.
        </SectionDescription>
        <SettingsCallout tone="warning">
          This can&apos;t be undone. Make sure you&apos;ve saved your recovery
          phrase somewhere safe before continuing.
        </SettingsCallout>
        <DangerBtn
          data-testid="reset-wallet-btn"
          onClick={() => setIsResetConfirmOpen(true)}
        >
          Reset Wallet
        </DangerBtn>
      </SectionCard>

      <SectionCard>
        <Flex.Row align="center" gap="0.8rem">
          <IconServerCog size={20} stroke={1.75} color="currentColor" />
          <SectionHeader>Custom ETH Node</SectionHeader>
        </Flex.Row>
        <SectionDescription>
          Connect through your own Ethereum node instead of the default one.
        </SectionDescription>
        <SettingsCallout tone="info">
          Advanced — most people can leave this blank and keep using the default
          node.
        </SettingsCallout>
        <FieldRow>
          <TextInput
            id="eth-node-url"
            label="Custom ETH Node URL"
            placeholder={'{wss|https}://{url}'}
            value={ethNodeUrl}
            onChange={(e) => setEthUrl(e.value)}
          />
        </FieldRow>
        <Btn onClick={() => props.updateEthNodeUrl(ethNodeUrl)}>Save</Btn>
      </SectionCard>

      <SectionCard>
        <Flex.Row align="center" gap="0.8rem">
          <IconRouter size={20} stroke={1.75} color="currentColor" />
          <SectionHeader>Failover Mechanism</SectionHeader>
        </Flex.Row>
        <SectionDescription>
          A failover policy is applied when a provider is unable to service an
          open session. This policy ensures continuity by automatically
          rerouting or reassigning sessions to an alternate provider, minimizing
          service disruptions and maintaining a seamless user experience.
        </SectionDescription>
        <FieldRow>
          <ToggleRow htmlFor="use-default-failover-policy">
            <ToggleInput
              id="use-default-failover-policy"
              checked={useFailover}
              onChange={(e) => setUseFailover(Boolean(e.target.checked))}
            />
            <ToggleLabel>Use Default Policy (set by proxy-router)</ToggleLabel>
          </ToggleRow>
        </FieldRow>
        <Btn onClick={() => props.updateFailoverSetting(useFailover)}>
          Apply
        </Btn>
      </SectionCard>

      <Modal
        variant="primary"
        title="Reset Wallet?"
        isOpen={isResetConfirmOpen}
        onRequestClose={() => setIsResetConfirmOpen(false)}
      >
        <ConfirmBody data-testid="confirm-reset-wallet-modal">
          <ConfirmMessage>
            This removes your wallet from this device. If you haven&apos;t saved
            your recovery phrase, any funds in this wallet will become
            unreachable.
          </ConfirmMessage>
          <ConfirmActions>
            <GhostBtn
              data-testid="cancel-reset-wallet-btn"
              onClick={() => setIsResetConfirmOpen(false)}
            >
              Cancel
            </GhostBtn>
            <DangerBtn
              data-testid="confirm-reset-wallet-btn"
              onClick={() => props.logout()}
            >
              Yes, reset wallet
            </DangerBtn>
          </ConfirmActions>
        </ConfirmBody>
      </Modal>
    </>
  );
};

type SettingsProps = CommonProps & {
  services: LoadingState;
};

const Settings = (props: SettingsProps) => {
  const toast = useContext(ToastsContext);
  const [activeTab, setActiveTab] = useState('common');

  return (
    <View data-testid="agents-container">
      <LayoutHeader title="Settings" />

      <Tabs
        active={activeTab}
        onClick={(tab) => tab && setActiveTab(tab)}
        items={[
          { label: 'General', id: 'common' },
          { label: 'Services', id: 'services' },
        ]}
      />

      {activeTab === 'common' && (
        <Common
          client={props.client}
          getConfig={props.getConfig}
          logout={props.logout}
          updateEthNodeUrl={props.updateEthNodeUrl}
          updateFailoverSetting={props.updateFailoverSetting}
        />
      )}

      {activeTab === 'services' && (
        <SectionCard>
          <SectionHeader>Services</SectionHeader>
          <SectionDescription>
            Advanced diagnostics for the background services that power your
            node. Most people won&apos;t need to touch this.
          </SectionDescription>
          {props.services.startup.map((item) => (
            <StartupItemComponent
              key={item.id}
              item={item}
              alwaysShowPingRestart={true}
              onRestart={() => props.client.restartService({ service: item.id })}
              onPing={async () => {
                const res = await props.client.pingService({
                  service: item.id,
                });
                if (res === true) {
                  toast.toast('success', 'Ping successful');
                } else {
                  toast.toast('error', 'Ping failed');
                }
              }}
            />
          ))}
        </SectionCard>
      )}
    </View>
  );
};

export default withServicesState(withSettingsState(Settings));
