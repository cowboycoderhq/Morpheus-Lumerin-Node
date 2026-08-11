import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconCircleCheck,
  IconLoader2,
  IconSearch,
  IconWorldOff,
  IconCheck,
  IconStar,
  IconThumbDown,
} from '@tabler/icons-react';
import Modal from '../contracts/modals/Modal';
import { sendToMainProcess } from '../../client/utils';
import { explainSessionOpenFailure } from '../../utils/session-errors';
import {
  applyPreference,
  nextPreference,
  preferenceOf,
  sortProvidersByPreference,
  type ProviderPreference,
  type ProviderPrefs,
} from '../../utils/provider-prefs';
import {
  bodyProps,
  Body,
  CalloutText,
  CheapestBadge,
  EmptyState,
  ErrorCallout,
  Footer,
  FooterLeft,
  FooterRight,
  GhostBtn,
  Header,
  Layout,
  LoadingState,
  OptionList,
  OptionMain,
  OptionMeta,
  OptionName,
  OptionRow,
  PriceBlock,
  PriceUnit,
  PriceValue,
  PrimaryBtn,
  RecapLine,
  ResultCount,
  SearchWrapper,
  SpinIcon,
  StakeNote,
  StakeValue,
  StepDot,
  StepDots,
  StepLabel,
  StepMeta,
  Subtitle,
  SummaryCard,
  SummaryLabel,
  SummaryRow,
  SummaryValue,
  Title,
  WarningCallout,
  FailureHeadline,
  FailureAdvice,
  FailureDetails,
  FailureRaw,
  SuccessCallout,
  LaunchRow,
  MarkGroup,
  MarkBtn,
} from './StartPickerModal.styles';

// ============================================================================
// /start — walks the user through opening a paid Morpheus blockchain session:
// model -> provider -> duration -> confirm. Talks ONLY to the local
// /morpheus/v1/* surface the main process already exposes (see
// src/main/src/openai-compat/server.ts); this file owns presentation only.
// ============================================================================

type Props = {
  open: boolean;
  /** Free text typed after `/start`, may be ''. Prefills the model search. */
  args: string;
  /** Endpoint base + bearer token, from client.getOpenAiApiConfig(). */
  baseUrl: string;
  token: string;
  /** ALWAYS called exactly once per `open` — cancel, error, or success. */
  onDone: (outcome: { opened: boolean; note?: string }) => void;
  /**
   * Fired the moment a session opens, before the user dismisses anything.
   *
   * Separate from `onDone` because the terminal is waiting: settling the offer
   * republishes the model list and drops the cached "no session", so a resend
   * works while this dialog is still on screen. Waiting for a dismissal would
   * mean the user sees "session opened" and their agent still gets refused.
   */
  onOpened?: (outcome: { note?: string }) => void;
};

type Step = 'model' | 'provider' | 'duration' | 'confirm';

const STEP_ORDER: Step[] = ['model', 'provider', 'duration', 'confirm'];

const STEP_TITLE: Record<Step, string> = {
  model: 'Choose a model',
  provider: 'Choose a provider',
  duration: 'Choose a session length',
  confirm: 'Confirm & open',
};

type CatalogModel = { id: string; name: string };

type Catalog = {
  models: CatalogModel[];
  maxSessionSeconds: number;
  minSessionSeconds: number;
};

type Provider = {
  bidId: string;
  provider: string;
  pricePerSecond: string;
  stakeMorPerHour: number;
};

type ProvidersResponse = {
  modelId: string;
  providers: Provider[];
  maxSessionSeconds: number;
  minSessionSeconds: number;
};

type Quote = {
  modelId: string;
  bidId: string;
  durationSec: number;
  stakeMor: number;
  allowed: boolean;
  reason?: string;
};

type OpenSessionResponse = {
  sessionId: string;
  model: string;
  modelResolved: boolean;
  stakeMor: number;
  durationSec: number;
};

type DurationPreset = { label: string; seconds: number };

// Every preset the picker offers; the ones outside [min,max] for this chain
// are filtered out once the catalog reports its bounds.
const DURATION_PRESETS: DurationPreset[] = [
  { label: '5 minutes', seconds: 305 },
  { label: '30 minutes', seconds: 1800 },
  { label: '1 hour', seconds: 3600 },
  { label: '6 hours', seconds: 21600 },
  { label: '12 hours', seconds: 43200 },
  { label: '1 day', seconds: 86400 },
  { label: '3 days', seconds: 259200 },
  { label: '7 days', seconds: 604800 },
];

type ApiError = { message: string; code?: string };
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Talk to our own endpoint — through MAIN, never with fetch from here.
 *
 * The endpoint refuses any request carrying an `Origin` header and answers with
 * no CORS headers, deliberately: a web page must not be able to reach a port
 * that can spend MOR. This component runs in a browser, so its own fetch was
 * refused by that rule and blocked before it could read the reason, which is
 * what "Failed to fetch" was. Main has no Origin and holds the token, so the
 * rule stays as strict as it was for real pages.
 *
 * `baseUrl`/`token` are still taken as props and deliberately ignored — main
 * reads the live values, so a port or token that moved cannot strand the picker
 * with a stale pair.
 */
async function apiRequest<T>(
  _baseUrl: string,
  _token: string,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let res: { ok: boolean; status: number; data: unknown };
  try {
    res = await sendToMainProcess<
      { path: string; method?: string; body?: unknown },
      { ok: boolean; status: number; data: unknown }
    >('morpheus-api-request', {
      path,
      method: init?.method ?? 'GET',
      body:
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      // A session open waits on a chain transaction; the default would time out
      // mid-spend and leave the user unable to tell what happened.
    }, 180000);
  } catch (e) {
    return {
      ok: false,
      error: {
        message:
          e instanceof Error
            ? `Could not reach the local endpoint: ${e.message}`
            : 'Could not reach the local endpoint.',
      },
    };
  }

  if (!res?.ok) {
    const err = (res?.data as {
      error?: { message?: string; code?: string };
    } | null)?.error;
    return {
      ok: false,
      error: {
        message: err?.message || `Request failed with status ${res?.status}.`,
        // Carried so the failure can be EXPLAINED rather than just displayed:
        // our own refusals each know their own remedy, and the code is how.
        code: err?.code,
      },
    };
  }
  return { ok: true, data: res.data as T };
}

// Never invent a MOR figure: an unloaded value renders "…", never 0.
const formatMor = (n: number | null | undefined, decimals = 4): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '…'
    : n.toFixed(decimals);

const truncateAddr = (addr: string): string =>
  addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

function StartPickerModal({ open, args, baseUrl, token, onDone, onOpened }: Props) {
  const prefersReducedMotion = useReducedMotion();

  // `onDone` is called through a ref so a stale closure captured by the
  // Escape-key listener (set up once per `open` transition) always reaches
  // the CURRENT handler, not whichever one existed when the listener was
  // attached.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    void (async () => {
      try {
        const prefs: any = await sendToMainProcess('get-provider-prefs');
        if (prefs && typeof prefs === 'object') setProviderPrefs(prefs);
      } catch {
        /* no marks yet, or the bridge is not up — an empty set is correct */
      }
    })();
  }, []);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const doneRef = useRef(false);
  const finish = (outcome: { opened: boolean; note?: string }) => {
    if (doneRef.current) return; // onDone fires EXACTLY once per open.
    doneRef.current = true;
    onDoneRef.current(outcome);
  };
  const handleCancel = () => finish({ opened: false });

  const [step, setStep] = useState<Step>('model');

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState('');
  const [selectedModel, setSelectedModel] = useState<CatalogModel | null>(null);

  const [providers, setProviders] = useState<Provider[] | null>(null);
  // Marks survive the dialog, the session and the app: the whole point is that
  // next week's picker remembers which provider wasted your time.
  const [providerPrefs, setProviderPrefs] = useState<ProviderPrefs>({});
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null,
  );

  const [selectedDuration, setSelectedDuration] =
    useState<DurationPreset | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<ApiError | null>(null);
  // The session that was opened. Holding it here is what turns a dialog that
  // vanishes on success into one that tells you what happened and hands you the
  // next step — which for a terminal session is always "now go use it".
  const [opened, setOpened] = useState<{
    model: string;
    stakeMor: number;
    note: string;
  } | null>(null);
  const [launching, setLaunching] = useState<'grok' | 'opencode' | null>(null);
  const [launchNote, setLaunchNote] = useState<string | null>(null);

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    const res = await apiRequest<Catalog>(
      baseUrl,
      token,
      '/morpheus/v1/catalog',
    );
    setCatalogLoading(false);
    if (!res.ok) {
      setCatalogError(res.error.message);
      return;
    }
    setCatalog(res.data);
  };

  // Reset the whole flow every time the modal is (re)opened, and kick off the
  // catalog load — the only fetch that happens without a user click.
  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
    setStep('model');
    setModelFilter(args || '');
    setSelectedModel(null);
    setProviders(null);
    setProvidersError(null);
    setSelectedProvider(null);
    setSelectedDuration(null);
    setQuote(null);
    setQuoteError(null);
    setOpenError(null);
    setOpening(false);
    setCatalog(null);
    setCatalogError(null);
    setCatalogLoading(true);
    // Fire-and-forget: the effect itself cannot be async.
    void (async () => {
      const res = await apiRequest<Catalog>(
        baseUrl,
        token,
        '/morpheus/v1/catalog',
      );
      setCatalogLoading(false);
      if (!res.ok) {
        setCatalogError(res.error.message);
        return;
      }
      setCatalog(res.data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape always cancels (unless the flow has already finished).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish({ opened: false });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const normalize = (s: string) => s.toLowerCase().trim();

  const filteredModels = useMemo(() => {
    const models = catalog?.models ?? [];
    const q = normalize(modelFilter);
    if (!q) return models;
    const tokens = q.split(/\s+/).filter(Boolean);
    return models.filter((m) => {
      const hay = `${normalize(m.name)} ${normalize(m.id)}`;
      return tokens.every((t) => hay.includes(t));
    });
  }, [catalog, modelFilter]);

  const sortedProviders = useMemo(() => {
    if (!providers) return [];
    // Sorted, and the "cheapest" badge assigned, by PRICE — never by list
    // position, so a provider that arrives first in the response is not
    // mistaken for the cheapest one.
    // Marked-up first, marked-down last, price within each band. Price is the
    // tiebreak rather than the primary sort because a provider that does not
    // answer is not cheap at any price.
    return sortProvidersByPreference(providers, providerPrefs);
  }, [providers, providerPrefs]);

  const cheapestPrice = useMemo(() => {
    if (!providers || !providers.length) return null;
    return Math.min(...providers.map((p) => p.stakeMorPerHour));
  }, [providers]);

  const availableDurations = useMemo(() => {
    if (!catalog) return [];
    return DURATION_PRESETS.filter(
      (d) =>
        d.seconds >= catalog.minSessionSeconds &&
        d.seconds <= catalog.maxSessionSeconds,
    );
  }, [catalog]);

  if (!open) return null;

  const markProvider = async (
    address: string,
    pressed: ProviderPreference,
  ): Promise<void> => {
    const next = nextPreference(preferenceOf(providerPrefs, address), pressed);
    // Applied locally first so the row responds to the click immediately; main
    // is the store of record and its answer replaces this.
    setProviderPrefs((prev) => applyPreference(prev, address, next));
    try {
      const saved: any = await sendToMainProcess('set-provider-pref', {
        provider: address,
        preference: next ?? null,
      });
      if (saved && typeof saved === 'object') setProviderPrefs(saved);
    } catch {
      /* the local mark stands for this session */
    }
  };

  const handleSelectModel = async (m: CatalogModel) => {
    setSelectedModel(m);
    setSelectedProvider(null);
    setSelectedDuration(null);
    setQuote(null);
    setStep('provider');
    setProviders(null);
    setProvidersError(null);
    setProvidersLoading(true);
    const res = await apiRequest<ProvidersResponse>(
      baseUrl,
      token,
      `/morpheus/v1/providers?modelId=${encodeURIComponent(m.id)}`,
    );
    setProvidersLoading(false);
    if (!res.ok) {
      setProvidersError(res.error.message);
      return;
    }
    setProviders(res.data.providers);
  };

  const handleSelectProvider = (p: Provider) => {
    setSelectedProvider(p);
    setSelectedDuration(null);
    setQuote(null);
    setStep('duration');
  };

  const requestQuote = async (
    model: CatalogModel,
    provider: Provider,
    duration: DurationPreset,
  ) => {
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(true);
    const res = await apiRequest<Quote>(baseUrl, token, '/morpheus/v1/quote', {
      method: 'POST',
      body: JSON.stringify({
        modelId: model.id,
        bidId: provider.bidId,
        durationSec: duration.seconds,
      }),
    });
    setQuoteLoading(false);
    if (!res.ok) {
      setQuoteError(res.error.message);
      return;
    }
    setQuote(res.data);
  };

  const handleSelectDuration = (d: DurationPreset) => {
    if (!selectedModel || !selectedProvider) return;
    setSelectedDuration(d);
    setStep('confirm');
    void requestQuote(selectedModel, selectedProvider, d);
  };

  const handleOpenSession = async () => {
    if (!selectedModel || !selectedProvider || !selectedDuration || !quote)
      return;
    setOpening(true);
    setOpenError(null);
    const res = await apiRequest<OpenSessionResponse>(
      baseUrl,
      token,
      '/morpheus/v1/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          modelId: selectedModel.id,
          bidId: selectedProvider.bidId,
          durationSec: selectedDuration.seconds,
          confirm: true,
          confirmedStakeMor: quote.stakeMor,
        }),
      },
    );
    setOpening(false);
    if (!res.ok) {
      // Kept whole. The raw text is what makes a fault diagnosable; the plain
      // explanation is rendered above it, not instead of it.
      setOpenError(res.error);
      return;
    }
    const note = `Session opened for ${res.data.model} — staked ${formatMor(
      res.data.stakeMor,
    )} MOR.`;
    // Tell main NOW, not on dismiss: this releases the offer, drops the cached
    // model list and republishes, so the waiting terminal can succeed on its
    // next send rather than after the user gets round to closing this.
    onOpened?.({ note });
    setOpened({ model: res.data.model, stakeMor: res.data.stakeMor, note });
  };

  const handleBack = () => {
    if (step === 'provider') setStep('model');
    else if (step === 'duration') setStep('provider');
    else if (step === 'confirm') setStep('duration');
  };

  const stepIndex = STEP_ORDER.indexOf(step);

  const motionProps = prefersReducedMotion
    ? {
        initial: false,
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as const },
      };

  return (
    <Modal onClose={handleCancel} bodyProps={bodyProps}>
      <Layout>
        <Header>
          <StepMeta>
            <StepDots>
              {STEP_ORDER.map((s, i) => (
                <StepDot
                  key={s}
                  $state={
                    i < stepIndex
                      ? 'done'
                      : i === stepIndex
                        ? 'active'
                        : 'pending'
                  }
                />
              ))}
            </StepDots>
            <StepLabel>
              Step {stepIndex + 1} of {STEP_ORDER.length}
            </StepLabel>
          </StepMeta>
          <Title>{STEP_TITLE[step]}</Title>

          {step === 'model' && (
            <>
              <Subtitle>
                Search across the marketplace for a model to run.
              </Subtitle>
              <SearchWrapper>
                <InputGroup>
                  <InputGroup.Text>
                    <IconSearch size={18} />
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Search models…"
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    autoFocus
                    style={{
                      background: 'transparent',
                      border: 'none',
                      boxShadow: 'none',
                      outline: 'none',
                      fontSize: '1.35rem',
                    }}
                  />
                </InputGroup>
              </SearchWrapper>
              {catalog && (
                <ResultCount>
                  {filteredModels.length} of {catalog.models.length}{' '}
                  {catalog.models.length === 1 ? 'model' : 'models'}
                </ResultCount>
              )}
            </>
          )}

          {step === 'provider' && selectedModel && (
            <Subtitle>
              Providers bidding to serve {selectedModel.name}.
            </Subtitle>
          )}

          {step === 'duration' && selectedModel && selectedProvider && (
            <>
              <Subtitle>How long should the session stay open?</Subtitle>
              <RecapLine>
                <strong>{selectedModel.name}</strong> ·{' '}
                {truncateAddr(selectedProvider.provider)}
              </RecapLine>
            </>
          )}

          {step === 'confirm' && (
            <Subtitle>Review the session before it opens.</Subtitle>
          )}
        </Header>

        <Body>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} {...motionProps}>
              {step === 'model' && (
                <>
                  {catalogLoading && (
                    <LoadingState>
                      <SpinIcon>
                        <IconLoader2 size={22} stroke={2} />
                      </SpinIcon>
                      Loading the model catalog — this can take a few seconds
                      the first time.
                    </LoadingState>
                  )}
                  {!catalogLoading && catalogError && (
                    <>
                      <ErrorCallout>
                        <IconAlertTriangle size={20} stroke={2} />
                        <CalloutText>{catalogError}</CalloutText>
                      </ErrorCallout>
                      <div style={{ marginTop: '1.2rem' }}>
                        <GhostBtn onClick={() => void loadCatalog()}>
                          Try again
                        </GhostBtn>
                      </div>
                    </>
                  )}
                  {!catalogLoading && !catalogError && catalog && (
                    <>
                      {filteredModels.length === 0 ? (
                        <EmptyState>
                          <IconWorldOff size={32} stroke={1.5} />
                          <div>No models match your search.</div>
                        </EmptyState>
                      ) : (
                        <OptionList>
                          {filteredModels.map((m) => (
                            <OptionRow
                              key={m.id}
                              type="button"
                              onClick={() => void handleSelectModel(m)}
                            >
                              <OptionMain>
                                <OptionName>{m.name}</OptionName>
                                <OptionMeta>{m.id}</OptionMeta>
                              </OptionMain>
                            </OptionRow>
                          ))}
                        </OptionList>
                      )}
                    </>
                  )}
                </>
              )}

              {step === 'provider' && (
                <>
                  {providersLoading && (
                    <LoadingState>
                      <SpinIcon>
                        <IconLoader2 size={22} stroke={2} />
                      </SpinIcon>
                      Checking who is bidding on this model…
                    </LoadingState>
                  )}
                  {!providersLoading && providersError && (
                    <>
                      <ErrorCallout>
                        <IconAlertTriangle size={20} stroke={2} />
                        <CalloutText>{providersError}</CalloutText>
                      </ErrorCallout>
                      <div
                        style={{
                          marginTop: '1.2rem',
                          display: 'flex',
                          gap: '0.8rem',
                        }}
                      >
                        <GhostBtn
                          onClick={() =>
                            selectedModel &&
                            void handleSelectModel(selectedModel)
                          }
                        >
                          Try again
                        </GhostBtn>
                        <GhostBtn onClick={handleBack}>Back</GhostBtn>
                      </div>
                    </>
                  )}
                  {!providersLoading &&
                    !providersError &&
                    providers &&
                    providers.length === 0 && (
                      <>
                        <EmptyState>
                          <IconWorldOff size={32} stroke={1.5} />
                          <div>
                            No provider is currently bidding on this model.
                          </div>
                        </EmptyState>
                        <div
                          style={{ display: 'flex', justifyContent: 'center' }}
                        >
                          <GhostBtn onClick={handleBack}>
                            <IconChevronLeft size={16} stroke={2} />
                            Back to models
                          </GhostBtn>
                        </div>
                      </>
                    )}
                  {!providersLoading &&
                    !providersError &&
                    sortedProviders.length > 0 && (
                      <OptionList>
                        {sortedProviders.map((p) => (
                          <OptionRow
                            key={p.bidId}
                            type="button"
                            onClick={() => handleSelectProvider(p)}
                            style={{
                              gridTemplateColumns: '1fr auto auto',
                              // A marked-down provider stays selectable — it may
                              // be the only one left — but stops competing for
                              // attention with the ones that work.
                              opacity:
                                preferenceOf(providerPrefs, p.provider) ===
                                'disliked'
                                  ? 0.55
                                  : 1,
                            }}
                          >
                            <OptionMain>
                              <OptionName>
                                {truncateAddr(p.provider)}
                                {cheapestPrice !== null &&
                                  p.stakeMorPerHour === cheapestPrice && (
                                    <CheapestBadge>Cheapest</CheapestBadge>
                                  )}
                              </OptionName>
                              <OptionMeta title={p.provider}>
                                {p.provider}
                              </OptionMeta>
                            </OptionMain>
                            <PriceBlock>
                              <PriceValue>
                                {formatMor(p.stakeMorPerHour)}
                              </PriceValue>
                              <PriceUnit>MOR / hour</PriceUnit>
                            </PriceBlock>
                            {/* Marking is not choosing. Both stop the click
                                reaching the row, or judging a provider would
                                select it and walk you to the next step. */}
                            <MarkGroup>
                              <MarkBtn
                                as="span"
                                role="button"
                                tabIndex={0}
                                aria-label={
                                  preferenceOf(providerPrefs, p.provider) ===
                                  'favorite'
                                    ? 'Remove favourite'
                                    : 'Mark as favourite'
                                }
                                $on={
                                  preferenceOf(providerPrefs, p.provider) ===
                                  'favorite'
                                }
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  void markProvider(p.provider, 'favorite');
                                }}
                                onKeyDown={(e: React.KeyboardEvent) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void markProvider(p.provider, 'favorite');
                                  }
                                }}
                              >
                                <IconStar size={16} stroke={2} />
                              </MarkBtn>
                              <MarkBtn
                                as="span"
                                role="button"
                                tabIndex={0}
                                aria-label={
                                  preferenceOf(providerPrefs, p.provider) ===
                                  'disliked'
                                    ? 'Remove mark'
                                    : 'Mark down'
                                }
                                $on={
                                  preferenceOf(providerPrefs, p.provider) ===
                                  'disliked'
                                }
                                $bad
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  void markProvider(p.provider, 'disliked');
                                }}
                                onKeyDown={(e: React.KeyboardEvent) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void markProvider(p.provider, 'disliked');
                                  }
                                }}
                              >
                                <IconThumbDown size={16} stroke={2} />
                              </MarkBtn>
                            </MarkGroup>
                          </OptionRow>
                        ))}
                      </OptionList>
                    )}
                </>
              )}

              {step === 'duration' && (
                <>
                  {availableDurations.length === 0 ? (
                    <>
                      <EmptyState>
                        <IconWorldOff size={32} stroke={1.5} />
                        <div>
                          No preset session length fits this chain&apos;s
                          allowed range.
                        </div>
                      </EmptyState>
                      <div
                        style={{ display: 'flex', justifyContent: 'center' }}
                      >
                        <GhostBtn onClick={handleBack}>
                          <IconChevronLeft size={16} stroke={2} />
                          Back
                        </GhostBtn>
                      </div>
                    </>
                  ) : (
                    <OptionList>
                      {availableDurations.map((d) => {
                        const estimate =
                          selectedProvider != null
                            ? (selectedProvider.stakeMorPerHour * d.seconds) /
                              3600
                            : null;
                        return (
                          <OptionRow
                            key={d.seconds}
                            type="button"
                            onClick={() => handleSelectDuration(d)}
                          >
                            <OptionMain>
                              <OptionName>{d.label}</OptionName>
                            </OptionMain>
                            <PriceBlock>
                              <PriceValue>~{formatMor(estimate)}</PriceValue>
                              <PriceUnit>MOR</PriceUnit>
                            </PriceBlock>
                          </OptionRow>
                        );
                      })}
                    </OptionList>
                  )}
                </>
              )}

              {step === 'confirm' && (
                <>
                  {quoteLoading && (
                    <LoadingState>
                      <SpinIcon>
                        <IconLoader2 size={22} stroke={2} />
                      </SpinIcon>
                      Pricing this session…
                    </LoadingState>
                  )}
                  {!quoteLoading && quoteError && (
                    <>
                      <ErrorCallout>
                        <IconAlertTriangle size={20} stroke={2} />
                        <CalloutText>{quoteError}</CalloutText>
                      </ErrorCallout>
                      <div
                        style={{
                          marginTop: '1.2rem',
                          display: 'flex',
                          gap: '0.8rem',
                        }}
                      >
                        <GhostBtn
                          onClick={() =>
                            selectedModel &&
                            selectedProvider &&
                            selectedDuration &&
                            void requestQuote(
                              selectedModel,
                              selectedProvider,
                              selectedDuration,
                            )
                          }
                        >
                          Try again
                        </GhostBtn>
                        <GhostBtn onClick={handleBack}>Back</GhostBtn>
                      </div>
                    </>
                  )}
                  {!quoteLoading && !quoteError && quote && !quote.allowed && (
                    <WarningCallout>
                      <IconAlertTriangle size={20} stroke={2} />
                      <CalloutText>
                        {quote.reason ||
                          'This session is not allowed right now.'}
                      </CalloutText>
                    </WarningCallout>
                  )}
                  {opened && (
                    <>
                      <SuccessCallout>
                        <IconCheck size={20} stroke={2} />
                        <CalloutText>
                          <FailureHeadline>Session open</FailureHeadline>
                          <FailureAdvice>{opened.note}</FailureAdvice>
                        </CalloutText>
                      </SuccessCallout>
                      <StakeNote>
                        Your terminal can use this model now. If an agent was
                        waiting, send your request again — or start one here.
                      </StakeNote>
                      <LaunchRow>
                        <PrimaryBtn
                          disabled={launching !== null}
                          onClick={async () => {
                            setLaunching('grok');
                            setLaunchNote(null);
                            try {
                              const r: any = await sendToMainProcess(
                                'open-in-grok',
                                { modelId: opened.model },
                                120000,
                              );
                              setLaunchNote(
                                r?.ok
                                  ? 'grok is opening in a new terminal.'
                                  : r?.message ?? 'Could not open grok.',
                              );
                            } catch (e: any) {
                              setLaunchNote(String(e?.message ?? e));
                            }
                            setLaunching(null);
                          }}
                        >
                          {launching === 'grok' ? 'Opening…' : 'Open in grok'}
                        </PrimaryBtn>
                        <GhostBtn
                          disabled={launching !== null}
                          onClick={async () => {
                            setLaunching('opencode');
                            setLaunchNote(null);
                            try {
                              const r: any = await sendToMainProcess(
                                'open-in-opencode',
                                { modelId: opened.model },
                                120000,
                              );
                              setLaunchNote(
                                r?.ok
                                  ? 'opencode is opening in a new terminal.'
                                  : r?.message ?? 'Could not open opencode.',
                              );
                            } catch (e: any) {
                              setLaunchNote(String(e?.message ?? e));
                            }
                            setLaunching(null);
                          }}
                        >
                          {launching === 'opencode'
                            ? 'Opening…'
                            : 'Open in opencode'}
                        </GhostBtn>
                      </LaunchRow>
                      {/* Whatever happened, said plainly. A launch button that
                          silently does nothing is the worst of both. */}
                      {launchNote && <StakeNote>{launchNote}</StakeNote>}
                    </>
                  )}
                  {!opened && !quoteLoading && !quoteError && quote && quote.allowed && (
                    <>
                      <SummaryCard>
                        <SummaryRow>
                          <SummaryLabel>Model</SummaryLabel>
                          <SummaryValue title={selectedModel?.name}>
                            {selectedModel?.name ?? '…'}
                          </SummaryValue>
                        </SummaryRow>
                        <SummaryRow>
                          <SummaryLabel>Provider</SummaryLabel>
                          <SummaryValue title={selectedProvider?.provider}>
                            {selectedProvider
                              ? truncateAddr(selectedProvider.provider)
                              : '…'}
                          </SummaryValue>
                        </SummaryRow>
                        <SummaryRow>
                          <SummaryLabel>Duration</SummaryLabel>
                          <SummaryValue>
                            {selectedDuration?.label ?? '…'}
                          </SummaryValue>
                        </SummaryRow>
                        <SummaryRow>
                          <SummaryLabel>Stake</SummaryLabel>
                          <StakeValue>
                            {formatMor(quote.stakeMor)} MOR
                          </StakeValue>
                        </SummaryRow>
                      </SummaryCard>
                      <StakeNote>
                        The stake is collateral, not a fee. It is locked until
                        the end of the day the session closes, then returns
                        automatically.
                      </StakeNote>
                      {opening && (
                        <LoadingState>
                          <SpinIcon>
                            <IconLoader2 size={22} stroke={2} />
                          </SpinIcon>
                          Opening session…
                        </LoadingState>
                      )}
                      {!opening && openError && (
                        <ErrorCallout style={{ marginTop: '1.2rem' }}>
                          <IconAlertTriangle size={20} stroke={2} />
                          <CalloutText>
                            {(() => {
                              const why = explainSessionOpenFailure(
                                openError.message,
                                openError.code,
                              );
                              return (
                                <>
                                  <FailureHeadline>{why.headline}</FailureHeadline>
                                  <FailureAdvice>{why.whatToDo}</FailureAdvice>
                                  <FailureAdvice>
                                    {why.charged === 'no'
                                      ? 'No MOR was staked.'
                                      : 'It is not certain whether MOR was staked — the Sessions tab will show one if it opened.'}
                                  </FailureAdvice>
                                  {/* The raw text stays, one click away: it names
                                      the provider and the exact refusal, which is
                                      what makes a fault diagnosable at all. */}
                                  <FailureDetails>
                                    <summary>Technical details</summary>
                                    <FailureRaw>{openError.message}</FailureRaw>
                                  </FailureDetails>
                                </>
                              );
                            })()}
                          </CalloutText>
                        </ErrorCallout>
                      )}
                    </>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </Body>

        <Footer>
          <FooterLeft>
            {step !== 'model' && !opening && (
              <GhostBtn onClick={handleBack}>
                <IconChevronLeft size={16} stroke={2} />
                Back
              </GhostBtn>
            )}
          </FooterLeft>
          <FooterRight>
            {opened ? (
              <PrimaryBtn
                onClick={() => finish({ opened: true, note: opened.note })}
              >
                Done
              </PrimaryBtn>
            ) : step === 'confirm' && quote && !quote.allowed ? (
              <GhostBtn onClick={handleCancel}>Close</GhostBtn>
            ) : step === 'confirm' && quote && quote.allowed && openError ? (
              <>
                <GhostBtn onClick={handleCancel}>Close</GhostBtn>
                {explainSessionOpenFailure(openError.message, openError.code)
                  .offerAnotherProvider && (
                  <PrimaryBtn
                    onClick={() => {
                      setOpenError(null);
                      setStep('provider');
                    }}
                  >
                    Choose another provider
                  </PrimaryBtn>
                )}
              </>
            ) : (
              <GhostBtn onClick={handleCancel} disabled={opening}>
                Cancel
              </GhostBtn>
            )}
            {step === 'confirm' && quote && quote.allowed && !openError && (
              <PrimaryBtn
                onClick={() => void handleOpenSession()}
                disabled={opening}
              >
                {opening ? (
                  <>
                    <SpinIcon>
                      <IconLoader2 size={16} stroke={2} />
                    </SpinIcon>
                    Opening…
                  </>
                ) : (
                  <>
                    <IconCircleCheck size={16} stroke={2} />
                    Open session
                  </>
                )}
              </PrimaryBtn>
            )}
          </FooterRight>
        </Footer>
      </Layout>
    </Modal>
  );
}

export default StartPickerModal;
