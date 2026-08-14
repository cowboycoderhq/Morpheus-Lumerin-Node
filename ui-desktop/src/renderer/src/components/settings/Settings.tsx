import { LayoutHeader } from '../common/LayoutHeader';
import { View } from '../common/View';
import { Btn, Flex, Modal, Tabs, TextInput } from '../common';
import withSettingsState from '../../store/hocs/withSettingsState';
import { WhatsNew } from '../WhatsNew';
import { useContext, useEffect, useState } from 'react';
import {
  IconPalette,
  IconRouter,
  IconPlugConnected,
  IconServerCog,
  IconTrash,
  IconX,
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
  ThemeChoiceBtn,
  ToggleInput,
  ToggleLabel,
  ToggleRow,
  PinnedList,
  PinnedChip,
  SearchResults,
  SearchRow,
} from './Settings.styles';

// The 'aurora' variant is presented to users as "Jarvis". The internal key stays
// 'aurora' everywhere (theme map, stored preference, tests) — only the label
// changes, so existing installs keep their saved choice.
const THEME_LABELS: Record<ThemeVariant, string> = {
  aurora: 'Jarvis',
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
  // OpenAI-compatible endpoint. `apiCfg` mirrors what main reports back, so the
  // toggle reflects whether the port is ACTUALLY bound rather than what we asked
  // for — a port collision must not read as "on".
  const [apiCfg, setApiCfg] = useState<any>(null);
  const [apiTokenShown, setApiTokenShown] = useState(false);
  const [grok, setGrok] = useState<any>(null);
  const [ocStatus, setOcStatus] = useState<any>(null);
  const [ocBusy, setOcBusy] = useState(false);
  const [ocOutput, setOcOutput] = useState<string>('');
  const [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [pinBusy, setPinBusy] = useState('');
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [grokBusy, setGrokBusy] = useState(false);
  const [grokOutput, setGrokOutput] = useState<string>('');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  // The marketplace list, for turning pinned chain ids into names a person can
  // read — and for choosing new ones. Fetched through main, because this window
  // cannot call the endpoint directly (it refuses browsers, deliberately).
  const { variant, setVariant } = useThemeVariant();

  const pinnedIds: string[] = apiCfg?.starredModelIds ?? [];
  const isPinned = (id: string) =>
    pinnedIds.some((x) => x.toLowerCase() === id.toLowerCase());
  // A pinned model whose name we have not loaded still has to render as
  // something: the raw id, shortened, beats an empty chip.
  const modelName = (id: string) =>
    catalog.find((m) => m.id.toLowerCase() === id.toLowerCase())?.name ??
    `${id.slice(0, 10)}…`;
  const matchingModels = catalog
    .filter((m) => {
      const q = modelSearch.trim().toLowerCase();
      if (!q) return false;
      return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
    })
    .slice(0, 25);

  const togglePin = async (modelId: string) => {
    setPinBusy(modelId);
    try {
      const r: any = await props.client.toggleStarredModel({ modelId });
      if (Array.isArray(r?.starredModelIds)) {
        setApiCfg((prev: any) => ({ ...prev, starredModelIds: r.starredModelIds }));
      }
    } finally {
      setPinBusy('');
    }
  };

  useEffect(() => {
    if (!apiCfg?.running) return;
    let cancelled = false;
    void (async () => {
      try {
        const r: any = await props.client.morpheusApiRequest({
          path: '/morpheus/v1/catalog',
        });
        if (cancelled) return;
        if (r?.ok && Array.isArray(r.data?.models)) {
          setCatalog(r.data.models);
          setCatalogError(null);
        } else {
          setCatalogError(
            r?.data?.error?.message ?? 'Could not load the model list.',
          );
        }
      } catch (e: any) {
        if (!cancelled) setCatalogError(String(e?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiCfg?.running, props.client]);

  useEffect(() => {
    (async () => {
      const cfg = await props.getConfig();
      const customUrl = cfg?.DerivedConfig?.EthNodeURLs[0] || '';
      setEthUrl(customUrl);
      const failoverSettings = (await props.client.getFailoverSetting()) as
        | { isEnabled?: boolean }
        | undefined;
      setUseFailover(Boolean(failoverSettings?.isEnabled));
      try {
        setApiCfg(await props.client.getOpenAiApiConfig());
        setOcStatus(await props.client.getOpencodeStatus());
        setGrok(await props.client.getGrokStatus());
      } catch (e) {
        console.warn('Could not read the OpenAI endpoint config', e);
      }
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
          Choose how the app looks. Jarvis is the futuristic cyan/glass theme;
          Classic is the calm Morpheus green. You can switch anytime.
        </SectionDescription>
        <Flex.Row gap="0.8rem">
          {THEME_VARIANTS.map((v) => {
            const active = v === variant;
            return (
              <ThemeChoiceBtn
                key={v}
                $ghost={!active}
                data-testid={`theme-${v}`}
                aria-pressed={active}
                onClick={() => setVariant(v)}
              >
                {active ? `✓ ${THEME_LABELS[v]}` : THEME_LABELS[v]}
              </ThemeChoiceBtn>
            );
          })}
        </Flex.Row>
      </SectionCard>

      <SectionCard>
        <Flex.Row align="center" gap="0.8rem">
          <IconTrash size={20} stroke={1.75} color="currentColor" />
          <SectionHeader>Reset Wallet</SectionHeader>
        </Flex.Row>
        {/* Leads with the consequence, not with reassurance. This previously
            opened "does not touch any funds on-chain", which is true of the
            chain and false of the user: with no Recovery Phrase saved, funds
            you cannot reach are funds you have lost. dev's wording said so
            outright; a re-skin does not get to soften it. */}
        <SectionDescription>
          Remove this wallet from this device and set one up from scratch. If
          you have not saved its recovery phrase, its funds are lost forever.
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
          <IconPlugConnected size={20} stroke={1.75} color="currentColor" />
          <SectionHeader>OpenAI-compatible API</SectionHeader>
        </Flex.Row>
        <SectionDescription>
          Serve this app&apos;s models to tools that speak the OpenAI API —
          opencode, an OpenAI SDK, or anything that takes a base URL and a key.
          It listens on your machine only.
        </SectionDescription>
        <SettingsCallout tone="info">
          The endpoint never opens a session on its own, so it cannot spend MOR:
          it serves your local models plus any marketplace model you already
          have a session open for. Open a session in Chat first, then point your
          tool at it.
        </SettingsCallout>
        <FieldRow>
          <ToggleRow htmlFor="openai-api-enabled">
            <ToggleInput
              id="openai-api-enabled"
              checked={Boolean(apiCfg?.enabled)}
              onChange={async (e) => {
                const next = await props.client.setOpenAiApiConfig({
                  enabled: Boolean(e.target.checked),
                });
                setApiCfg(next);
              }}
            />
            <ToggleLabel>
              Enable the endpoint
              {apiCfg?.enabled && !apiCfg?.running
                ? ' — could not bind, is the port in use?'
                : ''}
            </ToggleLabel>
          </ToggleRow>
        </FieldRow>
        {apiCfg?.running && (
          <>
            <FieldRow>
              <TextInput
                id="openai-api-base"
                label="Base URL"
                value={`http://127.0.0.1:${apiCfg.port}/v1`}
                readOnly
                onChange={() => undefined}
              />
            </FieldRow>
            <FieldRow>
              <TextInput
                id="openai-api-key"
                label="API key"
                type={apiTokenShown ? 'text' : 'password'}
                value={apiCfg.token}
                readOnly
                onChange={() => undefined}
              />
            </FieldRow>
            <Flex.Row gap="0.8rem">
              <GhostBtn onClick={() => setApiTokenShown((v) => !v)}>
                {apiTokenShown ? 'Hide' : 'Show'} key
              </GhostBtn>
              <GhostBtn
                onClick={() => props.client.copyToClipboard(apiCfg.token)}
              >
                Copy key
              </GhostBtn>
              <GhostBtn
                onClick={async () =>
                  setApiCfg(await props.client.regenerateOpenAiApiToken())
                }
              >
                Regenerate
              </GhostBtn>
            </Flex.Row>
            {apiCfg.lastActivity && (
              <SettingsCallout tone="info">
                Last external use: {apiCfg.lastActivity.modelName} at{' '}
                {new Date(apiCfg.lastActivity.at).toLocaleTimeString()}.
              </SettingsCallout>
            )}

            {/* A way in that does not depend on the automatic notice having
                worked — it did not, for a tester, and the failure was silent. */}
            <FieldRow style={{ marginTop: '1.2rem' }}>
              <GhostBtn onClick={() => setShowWhatsNew(true)}>
                What’s new in this version
              </GhostBtn>
            </FieldRow>
            {showWhatsNew && (
              <WhatsNew forceOpen onClose={() => setShowWhatsNew(false)} />
            )}

            {/* WHICH MODELS YOUR TERMINAL SEES.
                This was the missing step: models had to be pinned before grok
                or opencode showed anything, and the only way to discover that
                was to open a terminal and find an empty picker. It is stated
                here, in the same card as the endpoint it governs. */}
            <SectionDescription style={{ marginTop: '1.6rem' }}>
              Models in your terminal
            </SectionDescription>
            <SettingsCallout tone={pinnedIds.length ? 'info' : 'warning'}>
              {pinnedIds.length
                ? 'These appear in grok and opencode. Pinning costs nothing and opens nothing — using one without a session is refused, and this app offers to open it.'
                : 'Nothing is pinned yet, so grok and opencode will show no Morpheus models. Pin one below. Pinning costs nothing and opens nothing — it makes the model selectable in your terminal.'}
            </SettingsCallout>

            {pinnedIds.length > 0 && (
              <PinnedList>
                {pinnedIds.map((id: string) => (
                  <PinnedChip key={id} title={id}>
                    {modelName(id)}
                    <button
                      aria-label={`Unpin ${modelName(id)}`}
                      disabled={pinBusy === id}
                      onClick={() => void togglePin(id)}
                    >
                      <IconX size={14} stroke={2} />
                    </button>
                  </PinnedChip>
                ))}
              </PinnedList>
            )}

            <FieldRow style={{ marginTop: '1.2rem' }}>
              <TextInput
                id="pin-model-search"
                placeholder="Search the marketplace to pin a model…"
                value={modelSearch}
                onChange={(e: any) => setModelSearch(e?.value ?? '')}
              />
            </FieldRow>
            {catalogError && (
              <SettingsCallout tone="warning">{catalogError}</SettingsCallout>
            )}
            {modelSearch.trim().length > 0 && (
              <SearchResults>
                {matchingModels.length === 0 && (
                  <SearchRow as="div" style={{ cursor: 'default' }}>
                    No model matches “{modelSearch.trim()}”.
                  </SearchRow>
                )}
                {matchingModels.map((m) => (
                  <SearchRow
                    key={m.id}
                    type="button"
                    disabled={pinBusy === m.id}
                    onClick={() => void togglePin(m.id)}
                  >
                    <span>
                      {isPinned(m.id) ? '✓ ' : ''}
                      {m.name}
                    </span>
                    <span className="id">{m.id}</span>
                  </SearchRow>
                ))}
              </SearchResults>
            )}

            {/* grok: pinned models in its picker, sessions opened here. */}
            {/* grok needs no switch any more.
                This used to enable a relay on grok's own leader socket so a
                typed /start could be intercepted. That is archived: models are
                published to grok automatically, and using one with no session
                is refused with an offer to open one — the same guarantee with
                nothing of grok's to sit inside. */}
            <SectionDescription style={{ marginTop: '1.6rem' }}>
              grok
            </SectionDescription>
            <SettingsCallout tone="info">
              {!grok?.installed
                ? 'grok is a terminal coding agent from xAI. Install it and your pinned models appear in its /model picker.'
                : pinnedIds.length
                  ? 'Your pinned models appear in grok’s /model picker. Pick one there; if it has no open session you will be told, and this window will offer to open one.'
                  : 'grok is installed, but nothing is pinned — its /model picker will show no Morpheus models. Pin one above.'}
            </SettingsCallout>
            {grok?.installed === false && (
              <>
                <SettingsCallout tone="info">
                  This runs <code>{grok?.installCommand}</code> in a shell.
                  Nothing is installed until you click.
                </SettingsCallout>
                <Btn
                  disabled={grokBusy}
                  onClick={async () => {
                    setGrokBusy(true);
                    setGrokOutput('');
                    try {
                      const r = (await props.client.installGrok()) as {
                        status?: any;
                        output?: string;
                      };
                      setGrok(r?.status ?? (await props.client.getGrokStatus()));
                      // Either way. An installer that fails silently leaves the
                      // user with a missing tool and no idea why.
                      setGrokOutput(r?.output ?? '');
                    } finally {
                      setGrokBusy(false);
                    }
                  }}
                >
                  {grokBusy ? 'Installing…' : 'Install grok'}
                </Btn>
              </>
            )}
            {grokOutput && (
              <SettingsCallout tone="info">
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: '12rem',
                    overflow: 'auto',
                    margin: 0,
                  }}
                >
                  {grokOutput}
                </pre>
              </SettingsCallout>
            )}

            {/* opencode setup lives inside this card because it is only
                meaningful once the endpoint it talks to is running. */}
            <SectionDescription style={{ marginTop: '1.6rem' }}>
              {!ocStatus?.installed
                ? 'opencode is not installed. It is a terminal coding agent that can drive your pinned models.'
                : pinnedIds.length
                  ? `opencode ${ocStatus.version} is installed. Your pinned models appear in its model list; open it below, or hand off from a session in Chat.`
                  : `opencode ${ocStatus.version} is installed, but nothing is pinned — it will show no Morpheus models. Pin one above.`}
            </SectionDescription>
            {ocStatus?.installed && (
              <Btn
                disabled={ocBusy}
                onClick={async () => {
                  setOcBusy(true);
                  try {
                    // No model: opencode opens with the Morpheus provider
                    // configured and nothing selected, which is where /start
                    // is meant to be run from.
                    const r: any = await props.client.openInOpencode({});
                    if (!r?.ok) {
                      setOcOutput(r?.message ?? 'Could not open opencode.');
                    }
                  } finally {
                    setOcBusy(false);
                  }
                }}
              >
                {ocBusy ? 'Opening…' : 'Open opencode'}
              </Btn>
            )}
            {!ocStatus?.installed && (
              <>
                <SettingsCallout tone="info">
                  This runs <code>{ocStatus?.installCommand}</code> in a shell.
                  Nothing is installed until you click.
                </SettingsCallout>
                <Btn
                  disabled={ocBusy}
                  onClick={async () => {
                    setOcBusy(true);
                    setOcOutput('');
                    try {
                      const r = (await props.client.installOpencode()) as { output?: string };
                      setOcStatus(
                        await props.client.getOpencodeStatus(),
                      );
                      // Show the installer's own output either way — a silent
                      // failure here is the worst outcome.
                      setOcOutput(r?.output ?? '');
                    } finally {
                      setOcBusy(false);
                    }
                  }}
                >
                  {ocBusy ? 'Installing…' : 'Install opencode'}
                </Btn>
              </>
            )}
            {ocOutput && (
              <SettingsCallout tone="info">
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: '12rem',
                    overflow: 'auto',
                    margin: 0,
                  }}
                >
                  {ocOutput}
                </pre>
              </SettingsCallout>
            )}
          </>
        )}
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
            your recovery phrase, its funds are lost forever.
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
