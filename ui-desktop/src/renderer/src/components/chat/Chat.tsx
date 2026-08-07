import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
// import component 👇
import {
  IconHistory,
  IconArrowUp,
  IconMessagePlus,
  IconShieldLock,
  IconUpload,
  IconMicrophone,
  IconPlayerStopFilled,
  IconBulb,
  IconCode,
  IconListSearch,
} from '@tabler/icons-react';
import {
  View,
  MessageBody,
  Container,
  CustomTextArrea,
  Control,
  LoadingCover,
  ImageContainer,
  VideoContainer,
  ChatIntroContainer,
  ChatHistoryContainer,
  ChatIntroInner,
  ChatIntroInnerTitle,
  ChatIntroInnerText,
  ChatIntroWarningText,
  ChatIntroButton,
  SendBtnWrapper,
  Btn,
  AudioInputZone,
  AudioActionBtn,
  AudioHint,
  TtsControlsRow,
  AudioPlayer,
  ChatHeader,
  HistoryDrawer,
  ChatIdentity,
  ModelGlyph,
  MessageOrb,
  ModelMeta,
  ModelName,
  ModelSubline,
  LiveDot,
  HeaderActions,
  HeaderBtn,
  SecureBadge,
  EmptyState,
  EmptyTitle,
  EmptySubtitle,
  PromptGrid,
  PromptCard,
  Composer,
  ComposerHint,
  MessageRow,
  TurnColumn,
  Bubble,
  SendRoundBtn,
  KeepAliveRow,
  KeepAliveLabel,
  KeepAliveChip,
  SessionLengthInput,
  SessionLengthField,
  SessionLengthMenu,
  SessionLengthOption,
  SessionLengthOptionHint,
  ChipStake,
  OpencodeOffer,
  OpencodeOfferActions,
  ReservedNotice,
  SessionLengthValue,
  SessionLengthNote,
  SessionLengthError,
} from './Chat.styles';
import withChatState from '../../store/hocs/withChatState';
import { abbreviateAddress } from '../../utils';
import { ThinkingMessageBody } from './ThinkingMessageBody';

import 'react-modern-drawer/dist/index.css';
import { ChatHistory } from './ChatHistory';
import Spinner from 'react-bootstrap/Spinner';
import ModelSelectionModal from './modals/ModelSelectionModal';
import {
  tryParseDataChunk,
  makeId,
  getColor,
  isClosed,
  generateHashId,
  isSecureModel,
  SECURE_BADGE_TOOLTIP,
  getModelModality,
  formatModelName,
  userTextFromPrompt,
  resolveChatSession,
  sessionsClaimedByOtherChats,
  upsertChat,
  claimedSessionIds,
  adoptableSessions,
} from './utils';
import { Cooldown } from './Cooldown';
import {
  useKeepAlive,
  blocksForDuration,
  requiredFreeStake,
  peakBlockStakes,
} from '../keepalive/KeepAliveProvider';
import {
  parseDuration,
  durationSuggestions,
  formatDurationLong,
} from '../../utils/duration';
import {
  getMaxSessionSeconds,
  FALLBACK_MAX_SESSION_SECONDS,
} from '../../utils/marketplace';
import ImageViewer from 'react-simple-image-viewer';
import { ChatData, HistoryMessage } from './interfaces';
import { formatMor } from '../../utils/coinValue';
import { ApiGateway } from 'src/main/src/client/apiGateway';
import { queryKeys, buildModelsWithBids } from '../../store/queries';

let abort = false;
let cancelScroll = false;
const userMessage = { user: 'Me', role: 'user', icon: 'M', color: '#20dc8e' };

// Common TTS voice presets. Names are backend-specific (Kokoro `af_*`,
// OpenAI `alloy`/`nova`/...), so the field also accepts free-text input.
const TTS_VOICES = [
  'af_bella',
  'af_alloy',
  'af_sky',
  'af_nicole',
  'am_adam',
  'am_michael',
  'alloy',
  'nova',
  'shimmer',
];

type ChatProps = {
  client: ApiGateway;
  address: string;
  symbol: string;
  config: any;
  toasts: {
    toast: (
      type: string,
      message: string,
      options?: { autoClose?: number },
    ) => void;
  };
  getModelsData: () => Promise<any>;
  getSessionsByUser: (address: string) => Promise<any>;
  // Optional so a consumer wired only to the older contract still renders (see
  // the fallback in liveSessionsQuery).
  getLiveSessionsByUser?: (
    address: string,
    maxSessionSeconds: number,
  ) => Promise<{ sessions: any[]; nextOffset: number; complete: boolean }>;
  getSessionsFromOffset?: (
    address: string,
    startOffset: number,
  ) => Promise<any[]>;
  getProvidersAvailability: (providers: any[]) => Promise<any[]>;
  getBidInfo: (id: string) => Promise<any>;
  getBidsByModelId: (id: string) => Promise<any>;
  getAllActiveBidsByModel: (providers: any[]) => Promise<Map<string, any[]>>;
  onOpenSession: (props: {
    modelId: string;
    duration: number;
    isDirectPay: boolean;
  }) => Promise<any>;
  onOpenSessionByBid: (props: {
    bidId: string;
    duration: number;
    isDirectPay: boolean;
  }) => Promise<any>;
  closeSession: (sessionId: string) => Promise<any>;
};

// Exported unwrapped for the isolate kit: withChatState only maps redux/context
// into these props, so a case can mount the REAL component with mock props
// instead of standing up a redux double whose shape would drift from the store.
export const Chat = (props: ChatProps) => {
  const chatBlockRef = useRef<null | HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const initializedRef = useRef(false);

  const [promptInput, setPromptInput] = useState('');
  // Overlay shown during user-triggered actions (open/close/reopen session,
  // manual session refresh). The *initial* page load no longer uses this — it
  // is gated on the react-query cache so revisiting the tab is instant.
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [messages, setMessages] = useState<any>([]);
  const [isOpen, setIsOpen] = useState(false);

  const [isSpinning, setIsSpinning] = useState(false);

  const [imagePreview, setImagePreview] = useState<string>();
  const [activeSession, setActiveSession] = useState<any>(undefined);

  const [chatData, setChatsData] = useState<ChatData[]>([]);


  const [openChangeModal, setOpenChangeModal] = useState(false);
  const [isReadonly, setIsReadonly] = useState(false);

  const [selectedBid, setSelectedBid] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState<any>(undefined);
  const [requiredStake, setRequiredStake] = useState<{
    min: number;
    max: number;
  }>({ min: 0, max: 0 });

  const [chat, setChat] = useState<ChatData | undefined>(undefined);

  // Which chat is open RIGHT NOW, readable from async work that started earlier.
  // `chat` captured in an async closure is its value at CALL time, which is the
  // whole bug in setSessionData: the session resolves seconds later, by which
  // point the user may be in a different thread.
  const chatIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    chatIdRef.current = chat?.id;
  }, [chat?.id]);

  // selectChat's parameter is also named `chatData` and shadows the list state,
  // so the list is reachable in there only through a ref.
  const chatListRef = useRef<ChatData[]>([]);
  useEffect(() => {
    chatListRef.current = chatData;
  }, [chatData]);

  // Latches the mount-restore below. Also set by selectChat / onCreateNewChat:
  // once the user has picked a thread, auto-restore must never override them.
  const restoredOnceRef = useRef(false);

  // A chat's session binding lives in TWO places — the live `chat` object and the
  // `chatData` drawer list — and selectChat reads the DRAWER entry. Updating only
  // the live one meant a reopen looked fine until you switched away and back, at
  // which point the stale drawer entry won and the just-paid-for session was
  // orphaned (the user had to stake a third time). Every binding change goes
  // through here so the two cannot drift.
  // `persist` is false only where KeepAliveProvider has ALREADY written the
  // binding for this block (it persists every run's rotation, including runs
  // whose chat is not on screen). Everywhere else it must default to true.
  const bindChatToSession = (
    chatId?: string,
    sessionId?: string,
    persist = true,
    modelId?: string,
  ) => {
    if (!chatId || !sessionId) {
      return;
    }
    // Persist it. MOR is spent when the session OPENS, but the router used to
    // record the owner only when the first prompt was stored — so opening (or
    // reopening) a session and switching away before typing left the binding in
    // renderer memory alone. On remount it was gone: the paid session was
    // orphaned, or adopted by another chat, which then wrote the theft to disk.
    // Fire-and-forget: a failed bind must not abandon a session that is already
    // paid for, and the no-adoption rule means the worst case is a visible
    // orphan rather than silent misbilling.
    if (persist) {
      props.client
        ?.updateChatSession?.({ id: chatId, sessionId, modelId })
        .then((okRes: boolean) => {
          // The contract is "a failed bind surfaces as an orphan", so it has to
          // actually surface. Returning false (disk full, permissions) used to be
          // swallowed silently, which is the failure mode this whole change is
          // meant to remove.
          if (okRes === false) {
            props.toasts.toast(
              'error',
              'Could not record which chat this session belongs to. It stays open and paid for — find it under Sessions.',
            );
          }
        })
        .catch((e: any) => console.warn('failed to persist chat session', e));
    }
    setChat((prev) =>
      prev && prev.id === chatId && prev.sessionId !== sessionId
        ? { ...prev, sessionId }
        : prev,
    );
    setChatsData((prev) =>
      prev.map((c) =>
        c.id === chatId && c.sessionId !== sessionId ? { ...c, sessionId } : c,
      ),
    );
  };

  // --- Session length --------------------------------------------------------
  // The user TYPES a length ("1 day", "2 years") and that length sets the stake:
  // the router derives the stake from the duration we open with. Free text with
  // an optional unit completion — parseDuration accepts every alias, the
  // datalist is a convenience and never a constraint.
  // Defaults to the shortest session the chain sells. The length now sets the
  // stake, so the default IS a default spend — anything longer would silently
  // make the untouched path cost more than the control it replaced.
  const [sessionLengthInput, setSessionLengthInput] = useState('5 minutes');
  // Unit completion. Open only while the user is actually typing — a menu that
  // springs open on focus would sit over the Stake button for no reason.
  // Offered right after a session opens: hand it straight to opencode. Only
  // shown when the handoff would actually work (endpoint running, opencode
  // installed) — an offer that fails on click is worse than no offer.
  const [opencodeOffer, setOpencodeOffer] = useState<{
    modelId: string;
    modelName: string;
  } | null>(null);
  // idle → launching (writing config, opening the terminal) → launched.
  // Launching is not instant: it detects opencode, writes the provider config
  // and shells out, and with no feedback the click read as if nothing happened.
  const [opencodeState, setOpencodeState] = useState<
    'idle' | 'launching' | 'launched'
  >('idle');
  const [lengthMenuOpen, setLengthMenuOpen] = useState(false);
  const [lengthMenuIndex, setLengthMenuIndex] = useState(0);
  // Restake strategy, and it only matters ABOVE the chain's per-session cap —
  // below the cap a session is one block and there is nothing to rotate. Kept in
  // state (not derived) so a user who set it for a long session keeps their
  // choice while they edit the number.
  const [restakeMode, setRestakeMode] = useState<'seamless' | 'economy'>(
    'seamless',
  );
  // Chosen provider (bid Id) to stake against; null = Auto (router picks).
  const [selectedProviderBidId, setSelectedProviderBidId] = useState<
    string | null
  >(null);
  const keepAlive = useKeepAlive();
  // Rolling sessions are now per-chat and concurrent, so almost every question
  // the UI used to ask of "the run" is really about THIS chat's run. Reading the
  // global map directly is how a sibling chat's run would light up this one's
  // header and, worse, hand this chat someone else's session id.
  const myRun = chat?.id ? keepAlive.statuses[chat.id] : undefined;
  const myRunSession = chat?.id ? keepAlive.sessionsByChat[chat.id] : undefined;
  // Guards the Stake button against a double-click opening two first blocks
  // before the first render reflects the started run.
  const startingSessionRef = useRef(false);

  // --- Cached data layer (stale-while-revalidate via react-query) ---------
  // These queries live in the app-level QueryClient, so navigating away from
  // and back to /chat serves cached data instantly and revalidates silently
  // instead of blocking behind a full-screen spinner.

  const modelsDataQuery = useQuery({
    queryKey: queryKeys.modelsData,
    queryFn: () => props.getModelsData(),
  });

  // The chain's ceiling on ONE session (`getMaxSessionDuration`, 7 days at the
  // time of writing). Read, never hardcoded — it is owner-settable, and a stale
  // copy would quote a stake for time the chain will not sell. Cached for the
  // hour: it does not move, but it can, and a keystroke must not cost a round
  // trip. Falls back to the deployment value if no ETH node is reachable.
  const maxSessionQuery = useQuery({
    queryKey: queryKeys.maxSessionSeconds,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const cfg: any = await props.client.getProxyRouterDerivedConfig();
      const rpcUrl = cfg?.DerivedConfig?.EthNodeURLs?.[0] ?? '';
      return getMaxSessionSeconds(rpcUrl, props.config?.chain?.diamondAddress);
    },
  });
  const maxSessionSeconds =
    maxSessionQuery.data ?? FALLBACK_MAX_SESSION_SECONDS;

  // Sessions load in two stages, and only the FIRST one gates the screen.
  //
  // Stage 1 walks the newest pages until it has every session that could still
  // be open (see getLiveSessionsByUser for why that set is bounded). That is the
  // whole correctness requirement: a chat whose session is live must never
  // render as sessionless, because the user would then be invited to pay for a
  // second one.
  //
  // Stage 2 walks the rest — closed, historical sessions that only affect how
  // OLD chats are labelled. Blocking first paint on it meant opening Chat cost
  // one chain read per 50 sessions ever created, serially, forever growing: a
  // rolling session mints one on-chain session per block, so every afternoon of
  // testing made the next open slower.
  const liveSessionsQuery = useQuery({
    queryKey: queryKeys.liveSessions(props.address),
    // Falls back to the full walk when the bounded fetcher is not wired in.
    // Slower, but "sessions never load" is the worse failure on this screen: the
    // gate below would hold the spinner forever, and any consumer that mounts
    // Chat with only the old contract would hang rather than degrade.
    queryFn: () =>
      props.getLiveSessionsByUser
        ? props.getLiveSessionsByUser(props.address, maxSessionSeconds)
        : Promise.resolve(props.getSessionsByUser(props.address)).then(
            (all: any) => ({
              sessions: all ?? [],
              nextOffset: (all ?? []).length,
              complete: true,
            }),
          ),
    enabled: !!props.address,
  });

  const liveWindow = liveSessionsQuery.data;

  const sessionsTailQuery = useQuery({
    queryKey: queryKeys.sessionsTail(props.address, liveWindow?.nextOffset),
    queryFn: () =>
      props.getSessionsFromOffset!(props.address, liveWindow?.nextOffset ?? 0),
    // Only when the live walk actually stopped early. A short final page means
    // the history is already complete and there is no tail to ask for. The
    // fallback path always reports complete, so this never fires without the
    // fetcher present.
    enabled:
      !!props.address &&
      !!liveWindow &&
      !liveWindow.complete &&
      !!props.getSessionsFromOffset,
  });

  const chatTitlesQuery = useQuery({
    queryKey: queryKeys.chatTitles,
    queryFn: () => props.client.getChatHistoryTitles(),
  });

  // The two stages, as one list. Live sessions come first (they are the newest),
  // then the tail once it lands. Every existing `sessions` consumer reads this
  // and cannot tell the difference — except that it now arrives in two parts,
  // the first of which is enough to be correct.
  const sessionsData = useMemo(() => {
    const live = liveWindow?.sessions;
    if (!live) {
      return undefined;
    }
    const tail = sessionsTailQuery.data;
    return tail?.length ? [...live, ...tail] : live;
  }, [liveWindow, sessionsTailQuery.data]);

  // Stands in for the old sessionsQuery so the rest of the component (and the
  // loading gate) keeps reading one thing.
  const sessionsQuery = {
    data: sessionsData,
    isLoading: liveSessionsQuery.isLoading,
  };

  // Bid fan-out for every marketplace model. Runs in the background after the
  // base model list is available; does NOT gate the initial render. Mirrors the
  // previous "effect #2" merge logic but cached across visits.
  const modelsWithBidsQuery = useQuery({
    queryKey: queryKeys.modelsWithBids,
    enabled: !!modelsDataQuery.data,
    // Walk PROVIDERS (~21) once instead of fanning out one bid query per MODEL
    // (~391), which made the picker take minutes to populate. Same bid set.
    queryFn: () =>
      buildModelsWithBids(modelsDataQuery.data, props.getAllActiveBidsByModel),
  });

  const availabilityQuery = useQuery({
    queryKey: queryKeys.providersAvailability,
    enabled: !!modelsDataQuery.data?.providers?.length,
    staleTime: 5 * 60_000,
    queryFn: () => props.getProvidersAvailability(modelsDataQuery.data.providers),
  });

  // Full (unfiltered) model list — local + every marketplace model, no bids.
  // Used for mapping sessions/chats by id, matching the original mount logic.
  const allModels: any[] | undefined = modelsDataQuery.data?.models;

  // chainData.models prefers the bid-enriched (and bid-filtered) list once it
  // is available, otherwise falls back to the raw list so the UI can render.
  const chainData = useMemo(() => {
    const md = modelsDataQuery.data;
    if (!md) {
      return null;
    }
    return { ...md, models: modelsWithBidsQuery.data ?? md.models };
  }, [modelsDataQuery.data, modelsWithBidsQuery.data]);

  const meta = modelsDataQuery.data?.meta ?? { budget: 0, supply: 0 };
  const balances = modelsDataQuery.data?.userBalances ?? { eth: 0, mor: 0 };
  const providersAvailability = availabilityQuery.data ?? [];
  const allProviders: any[] = modelsDataQuery.data?.providers ?? [];
  const bidsLoading = modelsWithBidsQuery.isFetching;

  // A provider registers an endpoint (e.g. "mordiem.com:3333"); its hostname is
  // the friendly name. Show that when it's a real domain, else fall back to the
  // abbreviated wallet address (bids only carry the address).
  const providerLabel = (address: string) => {
    const ep = allProviders.find((p) => p.Address == address)?.Endpoint;
    if (ep) {
      try {
        const host = new URL(
          ep.includes('://') ? ep : `http://${ep}`,
        ).hostname;
        if (host && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
          return host;
        }
      } catch {
        /* malformed endpoint — fall through to the address */
      }
    }
    return abbreviateAddress(address, 4);
  };

  const sessions = useMemo(() => {
    const raw = sessionsQuery.data;
    if (!raw || !allModels) {
      return [];
    }
    return raw.reduce((res: any[], item: any) => {
      const sessionModel = allModels.find((x) => x.Id == item.ModelAgentId);
      if (sessionModel) {
        res.push({ ...item, ModelName: sessionModel.Name });
      }
      return res;
    }, []);
  }, [sessionsQuery.data, allModels]);

  // Initial-load overlay: only while there is no cached data yet. On revisits
  // every query resolves synchronously from cache, so this is false and the
  // spinner never appears.
  const isLoading =
    isActionLoading ||
    !modelsDataQuery.data ||
    sessionsQuery.isLoading ||
    !initialized;

  // TTS controls + STT recording state
  const [ttsVoice, setTtsVoice] = useState('af_bella');
  const [ttsSpeed, setTtsSpeed] = useState(1);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const peakLevelRef = useRef<number>(0);
  const levelRafRef = useRef<number | null>(null);

  const modelName = selectedModel?.Name || 'Model';
  const isLocal = chat?.isLocal;
  const isSecure = isSecureModel(selectedModel);
  const modality = getModelModality(selectedModel);

  const providerAddress = isLocal
    ? '(local)'
    : selectedBid?.Provider
      ? providerLabel(selectedBid?.Provider)
      : 'Unknown';
  const isDisabled = (!activeSession && !isLocal) || isReadonly;
  // Staked MOR is the on-chain Stake on the session, not session cost. The old
  // (EndsAt-OpenedAt)*PricePerSecond was the cost — far smaller than the stake —
  // so real stakes rendered as "0.00". Read Stake directly; formatMor null-guards
  // tiny values.
  const stakedFunds = activeSession?.Stake
    ? formatMor(Number(activeSession.Stake), 18)
    : activeSession
      ? '0'
      : 0;

  // One-time selection of the default chat once the (possibly cached) model and
  // session data is available. Runs in a layout effect so that on a warm cache
  // the selection is committed before paint — no flash of the empty/intro state
  // and no transient spinner on tab revisits.
  useLayoutEffect(() => {
    if (initializedRef.current) {
      return;
    }
    const md = modelsDataQuery.data;
    const rawSessions = sessionsQuery.data;
    if (!md || !rawSessions) {
      return;
    }
    initializedRef.current = true;

    const models: any[] = md.models;

    const useLocalModelChat = () => {
      const localModel = models.find((m: any) => m.isLocal);
      if (localModel) {
        setSelectedModel(localModel);
        setChat({
          id: generateHashId(),
          createdAt: new Date(),
          modelId: localModel.Id,
          isLocal: true,
        });
      }
    };

    const mappedSessions = rawSessions.reduce((res: any[], item: any) => {
      const sessionModel = models.find((x) => x.Id == item.ModelAgentId);
      if (sessionModel) {
        res.push({ ...item, ModelName: sessionModel.Name });
      }
      return res;
    }, []);
    // A session a LIVE ROLLING RUN owns is not up for adoption. This effect used
    // to take openSessions[0] unconditionally, which during a run is that run's
    // current block, and staple it to a brand-new chat id — so two chats claimed
    // one stake, and the router wrote that onto disk on the next prompt. Chat
    // unmounts on every tab switch, so this fired on a routine trip to Wallet
    // and back, not just at startup.
    // The DURABLE record is the only claim that survives a relaunch: both
    // keep-alive maps are refs and are empty after the process restarts, which is
    // exactly the "open a session, quit before typing, reopen the app" case this
    // whole change exists for. Fold the persisted bindings from GET /v1/chats in,
    // or boot happily staples a paid session to a brand-new chat id again.
    // MERGE per chat, never spread: a chat can have both a live run entry and a
    // persisted one, and `{...live, ...persisted}` would silently drop whichever
    // lost — the same key-overwrite that already cost this branch two defects.
    const claimSources: Record<string, string[]> = {
      ...keepAlive.sessionIdsByChat,
    };
    (
      (chatTitlesQuery.data as Array<{ chatId: string; sessionId?: string }>) ||
      []
    ).forEach((t) => {
      if (t?.sessionId) {
        claimSources[t.chatId] = [
          ...(claimSources[t.chatId] || []),
          t.sessionId,
        ];
      }
    });
    const openSessions = adoptableSessions(
      mappedSessions.filter((s) => !isClosed(s)),
      claimSources,
      keepAlive.retainedSessionIds,
    );

    // A restore already put the user in the rolling thread; don't overwrite it.
    // The two effects race and the winner flipped with react-query cache warmth,
    // which made the restore fix's correctness accidental rather than designed.
    if (restoredOnceRef.current) {
      setInitialized(true);
      return;
    }

    if (!openSessions.length) {
      useLocalModelChat();
      setInitialized(true);
      return;
    }

    const latestSession = openSessions[0];
    const latestSessionModel = models.find(
      (m: any) => m.Id == latestSession.ModelAgentId,
    );

    if (!latestSessionModel) {
      useLocalModelChat();
      setInitialized(true);
      return;
    }

    // Commit the session selection synchronously (before paint), then fetch the
    // bid details in the background.
    setSelectedModel(latestSessionModel);
    setActiveSession(latestSession);
    setChat({
      id: generateHashId(),
      createdAt: new Date(),
      // `.Id`, not `.ModelAgentId` — ModelAgentId is a field on SESSIONS and
      // BIDS, not on models (this very model was found by `m.Id ==
      // session.ModelAgentId`). The boot chat was therefore created with
      // modelId: undefined, and selectChat bails on a chat with no model id, so
      // the session adopted at startup could never be returned to once left.
      modelId: latestSessionModel.Id,
      // Carry the binding on the chat, not just in activeSession, so this
      // boot-time thread survives a switch away and back like any other.
      sessionId: latestSession.Id,
    });
    setInitialized(true);

    props
      .getBidInfo(latestSession.BidID)
      .then((openBid) => {
        if (!openBid) {
          useLocalModelChat();
          return;
        }
        setSelectedBid(openBid);
      })
      .catch((e) => console.error('Failed to load open bid', e));
  }, [modelsDataQuery.data, sessionsQuery.data, chatTitlesQuery.data]);

  // Keep the chat-history drawer list in sync with the cached titles + models.
  useEffect(() => {
    const titles = chatTitlesQuery.data as
      | Array<{
          chatId: string;
          title: string;
          modelId: string;
          createdAt: number;
          isLocal: boolean;
          sessionId?: string;
        }>
      | undefined;
    if (!titles || !allModels) {
      return;
    }
    const mappedChatData = titles.reduce<ChatData[]>((res, item) => {
      const chatModel = allModels.find((x) => x.Id == item.modelId);
      if (chatModel) {
        res.push({
          id: item.chatId,
          title: item.title,
          createdAt: new Date(item.createdAt * 1000),
          modelId: item.modelId,
          isLocal: item.isLocal,
          sessionId: item.sessionId,
        });
      }
      return res;
    }, []);
    setChatsData(mappedChatData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTitlesQuery.data, allModels]);

  const toggleDrawer = () => {
    setIsOpen((prevState) => !prevState);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'instant') => {
    if (!cancelScroll) {
      chatBlockRef.current?.scroll({
        top: chatBlockRef.current.scrollHeight,
        behavior: behavior,
      });
    }
  };

  const MIN_REQUEST_SECONDS = 5 * 60 + 5; // 305s = 300s contract floor + 5s cushion for stake→duration truncation
  // SessionStorage.MIN_SESSION_DURATION — what the chain actually refuses below.
  const CONTRACT_MIN_SESSION_SECONDS = 5 * 60;

  // What the typed text means, in one place. Everything downstream — the note,
  // the chips, the affordability gate, the open itself — reads THIS, so the
  // number the user is shown and the number that gets staked cannot diverge.
  const parsedLength = parseDuration(sessionLengthInput);
  const askedSec = parsedLength.ok ? parsedLength.seconds : 0;
  // Below the contract's 5-minute floor the chain reverts with SessionTooShort().
  // Say so here rather than letting the user pay gas to find out. The test is
  // the CONTRACT's 300s, not the app's 305s: "5 minutes" is the most natural way
  // to ask for the minimum, and refusing it with "the shortest session is 5
  // minutes" would be a UI arguing with itself.
  const belowFloor = parsedLength.ok && askedSec < CONTRACT_MIN_SESSION_SECONDS;
  const sessionLengthValid = parsedLength.ok && !belowFloor;
  // What is actually opened. The extra 5s is the cushion that keeps the
  // stake→duration truncation from landing back under the contract minimum.
  const requestedSec = Math.max(askedSec, MIN_REQUEST_SECONDS);
  // One block is the whole ask, unless the ask exceeds what the chain will sell
  // in a single session — then blocks are cap-sized and get chained.
  const isChainedSession = requestedSec > maxSessionSeconds;
  const sessionBlockSeconds = isChainedSession
    ? maxSessionSeconds
    : requestedSec;
  // How many blocks this really is. NOT the same question as "is it longer than
  // the cap": just past the cap the remainder is smaller than the contract
  // minimum, so it is dropped and the plan is still ONE block. Asking
  // isChainedSession instead put the UI 304 seconds out of step with the
  // affordability gate — it offered a renewal mode for a plan with no renewals
  // and claimed twice the stake was needed, turning away solvent users. Every
  // "does this renew?" decision reads this count.
  const sessionBlockCount = blocksForDuration(
    requestedSec,
    restakeMode === 'seamless',
    sessionBlockSeconds,
  );
  const sessionRenews = sessionBlockCount > 1;
  // The SAME figure startRolling gates on, so the disclosure and the refusal
  // can never quote different prices for the same plan.
  const sessionPeakStakes = peakBlockStakes(
    sessionBlockCount,
    sessionBlockSeconds,
  );
  // Unit completions for what has been typed. Capped so the menu cannot grow
  // tall enough to sit over the Stake button beneath it.
  const lengthSuggestions = durationSuggestions(sessionLengthInput).slice(0, 5);
  const activeSuggestion =
    lengthMenuOpen && lengthSuggestions.length
      ? lengthSuggestions[
          Math.min(lengthMenuIndex, lengthSuggestions.length - 1)
        ]
      : null;

  const acceptLengthSuggestion = (value: string) => {
    setSessionLengthInput(value);
    setLengthMenuOpen(false);
    setLengthMenuIndex(0);
  };

  // Tab finishes the unit. Deliberately only when the menu is OPEN: with it
  // closed, Tab keeps its normal meaning and moves focus, so the completion
  // stays an offer rather than a thing the field forces on you.
  const onLengthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setLengthMenuOpen(false);
      return;
    }
    if (!lengthSuggestions.length) {
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setLengthMenuOpen(true);
      setLengthMenuIndex((i) => {
        const n = lengthSuggestions.length;
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1 + n;
        return next % n;
      });
      return;
    }
    if ((e.key === 'Tab' || e.key === 'Enter') && activeSuggestion) {
      e.preventDefault();
      acceptLengthSuggestion(activeSuggestion);
    }
  };

  const lengthErrorText = belowFloor
    ? `The network's shortest session is 5 minutes.`
    : parsedLength.ok || parsedLength.incomplete
      ? ''
      : parsedLength.error;

  const calculateAcceptableDuration = (
    pricePerSecond: number,
    balance: number,
    stakingInfo: { budget: number; supply: number },
  ) => {
    const delta = 60; // 1 minute

    if (balance > requiredStake.max) {
      return 24 * 60 * 60; // 1 day in seconds
    }

    const targetDuration = Math.round(
      (balance * Number(stakingInfo.budget)) /
        (Number(stakingInfo.supply) * pricePerSecond),
    );

    // Both branches used to be able to land on exactly the 5-min contract
    // minimum — the value the router truncates into a SessionTooShort() revert.
    // Floor everything at MIN_REQUEST_SECONDS instead.
    if (targetDuration - delta < MIN_REQUEST_SECONDS) {
      return MIN_REQUEST_SECONDS;
    }

    return Math.max(
      targetDuration - (targetDuration % 60) - delta,
      MIN_REQUEST_SECONDS,
    );
  };

  const calculateAcceptableDurationForDirectPay = (stakingInfo: {
    budget: number;
    supply: number;
  }) => {
    // there is a bug in the contract, that incorrectly validates the duration when using direct pay, (as if user would stake)
    // so we calculate which duration is equivalent to amount of stake for minimum stake session duration (5 minutes)
    return Math.round((5 * 60 * stakingInfo.supply) / stakingInfo.budget) + 1;
  };

  const setSessionData = async (sessionId) => {
    // The router can return a freshly-opened session id BEFORE that session is
    // queryable via getSessionsByUser (tx still mining / indexing lag). Poll a
    // few times before giving up, and NEVER commit a partial activeSession: a
    // {sessionId}-only object has no `.Id`, so the next chat request would send
    // session_id=undefined (router rejects it as invalid hex). On a hard miss,
    // throw WITHOUT touching state so callers (including the keep-alive loop)
    // stop cleanly and the prior good session stays intact.
    //
    // Capture WHICH chat this resolution is for. The poll above runs for up to
    // ~7.5s, and the failover path (handleSystemMessage, "new session opened")
    // fires it from inside the streaming loop WITHOUT setting isActionLoading —
    // the drawer stays clickable throughout. Committing to "the current chat" on
    // resolve therefore stamped a session onto whatever chat the user had
    // switched to, and because the router persists whatever the session_id
    // header carried, that theft became permanent on disk: a prompt in chat A
    // billed to chat B's session while A's own paid session sat unused.
    const targetChatId = chatIdRef.current;
    let targetSessionData;
    for (let attempt = 0; attempt < 5; attempt++) {
      const allSessions = await refreshSessions();
      targetSessionData = allSessions.find((x) => x.Id == sessionId);
      if (targetSessionData) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    if (!targetSessionData) {
      throw new Error(`Opened session ${sessionId} is not yet queryable`);
    }
    // Bind the chat this was STARTED for — always, even if the user has since
    // switched away, so its stake is never orphaned. Use targetSessionData.Id
    // rather than the raw argument so the stored id is the canonical one.
    const boundId = targetSessionData.Id ?? sessionId;
    bindChatToSession(
      targetChatId,
      boundId,
      true,
      targetSessionData.ModelAgentId,
    );

    // Only touch the VISIBLE session state if that chat is still the open one.
    // activeSession drives the outgoing session_id header; writing it for a chat
    // the user has left is exactly the mis-billing above.
    if (chatIdRef.current !== targetChatId) {
      return;
    }
    setActiveSession({ ...targetSessionData, sessionId });
    const targetModel = chainData?.models?.find(
      (x) => x.Id == targetSessionData.ModelAgentId,
    );
    const targetBid = targetModel?.bids?.find(
      (x) => x.Id == targetSessionData.BidID,
    );
    setSelectedBid(targetBid);
  };

  const onOpenSession = async (
    isReopen: boolean,
    isDirectPay: boolean,
    durationOverrideSec?: number,
  ) => {
    // A one-off session must never open on top of a rolling run: the mirror
    // effect would stomp activeSession back to the next rotated block, orphaning
    // MOR that was already spent here. Today the Direct Pay button cannot render
    // while a run is live (isCreateSessionMode is false whenever status.running
    // is true), so this is currently unreachable — which is exactly the problem.
    // That invariant lives in a render expression and a refactor of
    // isCreateSessionMode would silently retire it. startRolling has the same
    // guard; make it structural on both sides rather than incidental on one.
    if (myRun?.running) {
      return;
    }
    setIsActionLoading(true);
    // On reopen, selectedModel may be unset (a saved chat opened directly), so
    // fall back to the chat's model rather than reading `.bids` off undefined.
    const model =
      selectedModel ?? chainData?.models?.find((m: any) => m.Id == chat?.modelId);
    if (!model?.bids?.length) {
      props.toasts.toast(
        'error',
        'This model is no longer available — pick another to continue.',
      );
      setIsActionLoading(false);
      return;
    }
    if (!selectedModel) {
      setSelectedModel(model);
    }
    if (!isReopen) {
      setChat({
        id: generateHashId(),
        createdAt: new Date(),
        modelId: model.Id,
      });
    }

    // If the user pinned a specific provider, stake against that bid; otherwise
    // "Auto" lets the router choose. A pinned bid that's no longer in the model
    // falls back to Auto rather than erroring.
    const chosenBid = selectedProviderBidId
      ? model.bids.find((b: any) => b.Id == selectedProviderBidId)
      : null;

    // Size the session off the priciest provider we can AFFORD (Auto), or off the
    // pinned provider's price when one is chosen. Auto keeps the affordability
    // feature's behaviour (a wallet covering only some providers can still stake).
    const aff = getStakeAffordability(model.bids, Number(balances.mor));
    // A keep-alive block forces the 6-minute floor (durationOverrideSec) so only
    // one block is ever staked, regardless of balance. Without an override this
    // auto-sizes off balance, the existing single-session flow.
    const durationPrice = chosenBid
      ? Number(chosenBid.PricePerSecond)
      : aff.priceForDuration;
    const rawDuration =
      durationOverrideSec ??
      (isDirectPay
        ? calculateAcceptableDurationForDirectPay(meta)
        : calculateAcceptableDuration(
            durationPrice,
            Number(balances.mor),
            meta,
          ));
    // Hard-cap a staked session at the 24h contract ceiling. calculateAcceptableDuration's
    // own 24h early-return is keyed off requiredStake.max (sized off the AUTO price), so a
    // pinned CHEAPER provider could size past 24h — the chain would clamp it anyway, but the
    // wallet would over-lock stake for time the session can't use. Auto never exceeds 24h, so
    // this is a no-op there. Overrides (keep-alive's 6-min floor) and direct-pay are left as-is.
    const duration =
      durationOverrideSec !== undefined || isDirectPay
        ? rawDuration
        : Math.min(rawDuration, 24 * 60 * 60);

    // Don't attempt an on-chain open the wallet can't cover — it reverts with
    // "transfer amount exceeds balance" and strands the user in a dead session.
    // For Auto, price the guard off the CHEAPEST provider ("can we afford
    // ANYONE?" — the router matches an affordable one). For a pinned provider,
    // price off THAT provider, since the router won't substitute a cheaper one.
    const guardPrice = chosenBid
      ? Number(chosenBid.PricePerSecond)
      : aff.minPrice;
    const stakeNeeded = isDirectPay
      ? guardPrice * duration
      : Number(calculateStake(guardPrice, duration / 60));
    if (
      Number.isFinite(stakeNeeded) &&
      stakeNeeded > 0 &&
      Number(balances.mor) < stakeNeeded
    ) {
      props.toasts.toast(
        'error',
        'Not enough MOR to open this session — add MOR and try again.',
      );
      setIsActionLoading(false);
      return;
    }

    try {
      const openedSession = chosenBid
        ? await props.onOpenSessionByBid({
            bidId: chosenBid.Id,
            duration,
            isDirectPay,
          })
        : await props.onOpenSession({
            modelId: model.Id,
            duration,
            isDirectPay,
          });
      if (!openedSession) {
        return;
      }
      await setSessionData(openedSession);
      return openedSession;
    } finally {
      setIsActionLoading(false);
    }
  };

  // Open a session of the typed length. The length sets the stake: the router
  // derives the stake from the duration, so this is one open of `requestedSec`
  // whenever that fits the chain's per-session cap, and a chain of cap-sized
  // blocks when it does not. The loop runs in KeepAliveProvider (above the tab
  // router) so it survives leaving Chat; here we only gate affordability, seed a
  // fresh chat thread, and hand off to it.
  const startSession = async (isDirectPay: boolean) => {
    // Re-entrancy guard: a rapid double-click must not open two first blocks.
    // NOT gated on "some run is active" any more — starting a rolling session
    // while other chats roll is the point. startRolling always seeds a brand-new
    // chat id, so it can never collide with an existing run.
    if (startingSessionRef.current) {
      return;
    }
    // The button is disabled on an invalid length, but the length is the number
    // that becomes a stake — re-check it here rather than trusting a disabled
    // attribute to be the only path in.
    if (!sessionLengthValid) {
      props.toasts.toast(
        'error',
        lengthErrorText ||
          'Enter a session length — for example “30 minutes”, “1 day” or “2 years”.',
      );
      return;
    }
    startingSessionRef.current = true;
    try {
      const model =
        selectedModel ??
        chainData?.models?.find((m: any) => m.Id == chat?.modelId);
      if (!model?.bids?.length) {
        props.toasts.toast(
          'error',
          'This model is no longer available — pick another to continue.',
        );
        return;
      }
      // A pinned provider stakes every block against that bid; Auto lets the
      // router pick each block. Price the affordability gate off the pinned
      // provider when chosen, else off the priciest AFFORDABLE provider (the one
      // the router would size against).
      const chosenBid = selectedProviderBidId
        ? model.bids.find((b: any) => b.Id == selectedProviderBidId)
        : null;
      // Read the balance FRESH. `balances` comes from a react-query cache with
      // refetchOnWindowFocus off, and now that rolling sessions run concurrently
      // the cached figure can predate every stake the other runs have locked.
      // Gating on that stale number approves a run the wallet cannot fund: block
      // 1 opens and is paid for, block 2 reverts, and the run dies having spent
      // real MOR. Costs one request at the only moment it matters.
      let freeMor = Number(balances.mor);
      try {
        const fresh: any = await queryClient.fetchQuery({
          queryKey: queryKeys.modelsData,
          queryFn: () => props.getModelsData(),
          // WITHOUT this the refetch is a no-op: queryClient.ts sets a global
          // staleTime of 30s and fetchQuery returns cache while data is fresh,
          // so "read the balance FRESH" handed back the same stale number the
          // gate already had — measured, three consecutive reads, one request.
          staleTime: 0,
        });
        const refreshed = Number(fresh?.userBalances?.mor);
        if (Number.isFinite(refreshed)) {
          freeMor = refreshed;
        }
      } catch (e) {
        // Fall through on the cached value rather than blocking the user; the
        // router still rejects an unaffordable open, this gate is the early one.
        console.warn('keep-alive: balance refresh failed, using cached', e);
      }
      const aff = getStakeAffordability(
        model.bids,
        freeMor,
        sessionBlockSeconds,
      );
      const blockPrice = chosenBid
        ? Number(chosenBid.PricePerSecond)
        : aff.priceForDuration;
      // A block stakes for its OWN length, and that length is now the typed
      // session (up to the chain's cap) rather than a fixed 6-minute floor —
      // which is the whole point of the change: the length sets the stake. A
      // one-block session locks this once; a chained one locks it per block,
      // twice over at each seamless rotation.
      const perBlockStake = Number(
        calculateStake(blockPrice, sessionBlockSeconds / 60),
      );
      // Blocks do NOT tile end-to-end (seamless overlaps, economy gaps), so the
      // count must come from blocksForDuration — the twin of the loop's stop
      // condition. Pricing it as ceil(target / blockSeconds) understated
      // seamless by 50% at 2 blocks (2 priced, 3 opened) and ~10% at the max.
      const overlap = restakeMode === 'seamless';
      const blockCount = blocksForDuration(
        requestedSec,
        overlap,
        sessionBlockSeconds,
      );
      // A single block never restakes, so it only ever locks 1x.
      //
      // ANY renewing plan needs 2x, in BOTH modes. Seamless is obvious: block
      // N+1 opens before N expires, so two stakes are briefly live at once.
      // Economy is the same in practice — closing block N returns only the time
      // it did NOT use (~0.06% of a block that ran to its end) and locks the
      // rest until the end of the UTC day, so block N+1 must be funded with new
      // MOR while N's is still held. Measured on Base mainnet 2026-08-06; see
      // utils/marketplace.ts.
      //
      // This said `blockCount > 1 && overlap`, on a recycling premise that the
      // deployed contract does not implement. That understated economy by half
      // and let the gate approve renewing runs the wallet could not fund.
      // Kept for the wording of the refusal below; the AMOUNT comes from the
      // shared predicate so the gate and its checks cannot drift apart.
      const needsTwo = blockCount > 1;
      // Reserve what the OTHER live runs still need. Each run asking only "can I
      // peak at 2x?" oversubscribes the wallet once several are live: with a
      // 3.05 MOR balance and 0.305 MOR blocks the gate approved NINE concurrent
      // runs (measured), whose combined peak is 5.49 MOR. They then race for one
      // block of headroom at overlaps that fall at arbitrary phases, and the
      // losers revert having already paid for block 1. Free balance alone cannot
      // see this: the other runs' next stakes are still in the user's wallet.
      // No argument: startRolling always seeds a brand-new chat id, so there is
      // never an existing run of its own to exclude.
      const otherRunsNeed = keepAlive.committedOverlapWei();
      const needed = requiredFreeStake(
        blockCount,
        perBlockStake,
        otherRunsNeed,
        sessionBlockSeconds,
      );
      if (
        !aff.known ||
        (!chosenBid && aff.affordableCount < 1) ||
        !Number.isFinite(perBlockStake) ||
        perBlockStake <= 0 ||
        freeMor < needed
      ) {
        props.toasts.toast(
          'error',
          otherRunsNeed > 0
            ? `Not enough MOR for a session of ${formatDurationLong(askedSec)} — your ${keepAlive.runningCount} running session(s) still need about ${formatMor(otherRunsNeed, 18) ?? '—'} MOR. Stop one, shorten this session, or add MOR.`
            : needsTwo
              ? // No "switch to Economy" — that used to be offered as the cheaper
                // option, and it is not one: both modes need the same MOR now.
                // Quote the peak the gate actually enforces, not a hardcoded
                // "twice" — at a short chain cap several blocks' holds overlap
                // and the multiple is higher.
                `Not enough MOR for a session of ${formatDurationLong(askedSec)} — it renews every ${formatDurationLong(sessionBlockSeconds)} and needs about ${formatMor(perBlockStake * peakBlockStakes(blockCount, sessionBlockSeconds), 18) ?? '—'} MOR free, because a renewal opens before the previous stake comes back. Shorten it, or add MOR.`
              : `Not enough MOR for a session of ${formatDurationLong(askedSec)} — it needs about ${formatMor(perBlockStake, 18) ?? '—'} MOR staked. Shorten the session, or add MOR.`,
        );
        return;
      }

      // Seed a fresh chat thread and hand the restaking to the provider. The
      // mirror effect below adopts the provider's current block into activeSession.
      const chatId = generateHashId();
      setSelectedModel(model);
      setMessages([]);
      setChat({ id: chatId, createdAt: new Date(), modelId: model.Id });
      // Fire-and-forget: the offer is a convenience, and a failure to detect
      // opencode must never interfere with a session that is already opening.
      void (async () => {
        try {
          const status: any = await props.client.getOpencodeStatus();
          if (status?.installed && status?.endpointRunning) {
            setOpencodeOffer({ modelId: model.Id, modelName: model.Name });
          }
        } catch {
          /* no offer */
        }
      })();

      await keepAlive.start({
        modelId: model.Id,
        chatId,
        totalSeconds: requestedSec,
        blockSeconds: sessionBlockSeconds,
        isDirectPay,
        bidId: chosenBid ? chosenBid.Id : null,
        overlap,
        // So the NEXT run's gate can reserve this one's pending overlap.
        perBlockStakeWei: perBlockStake,
      });
    } finally {
      startingSessionRef.current = false;
    }
  };

  // Mirror the provider's current block into local state so the header (staked +
  // countdown) and inference (session_id header reads activeSession.Id) follow
  // the background rotation. Runs on mount too, so returning to Chat mid-run
  // restores the live session with no gap.
  // Only ever reads THIS chat's block, so a sibling run rotating its session can
  // no longer stamp itself over the open chat and bill its prompts to the wrong
  // thread. The old code read a single global currentSession and needed a chatId
  // guard bolted on; keying the lookup removes the failure mode instead of
  // catching it.
  useEffect(() => {
    if (!myRun?.running || !myRunSession) {
      return;
    }
    setActiveSession(myRunSession);
    // Clear readonly — but ONLY while this run's block is actually open.
    //
    // selectChat resolves a chat's PERSISTED binding, which for a rolling chat is
    // whichever block was current at its last prompt — long lapsed — so returning
    // to a live rolling thread set readonly and nothing cleared it: the composer
    // said "Session is closed" while the header offered "Stop renewing", on a
    // session the user was paying for.
    //
    // `myRun.running` is NOT the same as "this block is open". Economy mode
    // deliberately leaves a gap (REOPEN_DELAY_SEC, plus fetchSession polling)
    // during which the run is still running while sessionsByChat holds the
    // EXPIRED block. Clearing readonly unconditionally there re-enabled the
    // composer over a dead session and sent the prompt against it.
    if (!isClosed(myRunSession)) {
      setIsReadonly(false);
    }
    bindChatToSession(chat?.id, myRunSession.Id, false);
    const model = chainData?.models?.find(
      (m: any) => m.Id == myRunSession.ModelAgentId,
    );
    const bid = model?.bids?.find((b: any) => b.Id == myRunSession.BidID);
    if (bid) {
      setSelectedBid(bid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRunSession, myRun?.running, chat?.id]);

  // Restore the rolling thread when Chat (re)mounts during an active run (e.g.
  // returning from the Wallet tab). Re-point chat.id + model to the run and
  // reload its transcript; the mirror effect handles the live session.
  useEffect(() => {
    // ONCE per mount, and never after the user has chosen a thread themselves.
    //
    // This is a mount-restore, but its deps cannot express that: publish() hands
    // back a brand-new `statuses` object on every restake tick, and
    // `myRun?.running` flips the moment you leave a rolling chat. So the effect
    // re-fired on every tick and every navigation, and — whenever exactly one run
    // was live, the common case — it dragged the user straight back into the
    // rolling thread. Clicking another chat bounced back; "New chat" reverted the
    // model you had just picked; and a second run merely FINISHING was enough to
    // yank you out of the thread you were typing in, so the next message was
    // persisted to the wrong transcript and billed to the wrong session. The old
    // code was safe only because the blanket stop() made `running` false.
    if (restoredOnceRef.current) {
      return;
    }
    // With several runs there is no single "the" run to jump back to, and yanking
    // the user into an arbitrary one is worse than leaving them put.
    const running = Object.values(keepAlive.statuses).filter((s) => s.running);
    if (running.length !== 1 || myRun?.running) {
      return;
    }
    const st = running[0];
    if (chat?.id === st.chatId) {
      return;
    }
    restoredOnceRef.current = true;
    const model = chainData?.models?.find((m: any) => m.Id == st.modelId);
    if (model) {
      setSelectedModel(model);
    }
    setChat({
      id: st.chatId,
      createdAt: new Date(),
      modelId: st.modelId,
      sessionId: keepAlive.sessionsByChat[st.chatId]?.Id,
    });
    loadChatHistory(st.chatId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepAlive.statuses, myRun?.running]);

  const loadChatHistory = async (chatId: string) => {
    try {
      const history = await props.client.getChatHistory(chatId);
      const messages: HistoryMessage[] = [];
      if (!history) {
        return;
      }

      const model = chainData.models.find((m) => m.Id == history.modelId);
      const modelName = model?.Name || 'Model';
      const aiIcon = modelName.toUpperCase()[0];
      const aiColor = getColor(aiIcon);

      (history.messages || []).forEach((m: any) => {
        const prompt = m?.prompt || {};
        // Prompt shape differs by modality:
        //  - LLM/chat: { messages: [{ content }] }
        //  - TTS:      { input: '...' } (audio response is not stored replayably)
        //  - STT:      audio request (no messages); response is the transcript,
        //              flagged with isAudioContent on the stored message.
        const isChatPrompt =
          Array.isArray(prompt.messages) && prompt.messages.length > 0;
        const isTtsPrompt =
          !isChatPrompt && typeof prompt.input === 'string';
        const isSttMessage = !isChatPrompt && !isTtsPrompt && !!m.isAudioContent;

        // The router prepends the full conversation into each turn's
        // prompt.messages, so THIS turn's text is the last user message, not
        // messages[0]. See userTextFromPrompt.
        const userText: string = userTextFromPrompt(prompt, m.isAudioContent);

        messages.push({
          id: makeId(16),
          text: userText,
          user: userMessage.user,
          role: userMessage.role,
          icon: userMessage.icon,
          color: userMessage.color,
        });

        const assistant: HistoryMessage = {
          id: makeId(16),
          text: m.response,
          user: modelName,
          role: 'assistant',
          icon: aiIcon,
          color: aiColor,
        };
        if (isTtsPrompt) {
          // Synthesized audio is not persisted in a replayable form.
          assistant.text = '[Audio response — replay is not available from history]';
        } else if (!isSttMessage) {
          assistant.isImageContent = m.isImageContent;
          assistant.isVideoRawContent = m.isVideoRawContent;
        }
        messages.push(assistant);
      });
      setMessages(messages);
    } catch (e) {
      console.error('Failed to load chat history', e);
      props.toasts.toast('error', 'Failed to load chat history');
    }
  };

  // Refetch sessions through react-query so the shared cache (and every derived
  // `sessions` consumer) updates, and return the freshly-mapped list for callers
  // that need it synchronously (e.g. setSessionData).
  const refreshSessions = async () => {
    // Refetch the LIVE window only. This runs immediately after opening a
    // session — the one we are looking for is the newest that exists, so
    // re-walking the entire history to find it would put the old unbounded cost
    // back on the money path, where it hurts most. The tail is unchanged by a
    // new session (it only grows at the newest end), so it stays cached.
    const live = await queryClient.fetchQuery({
      queryKey: queryKeys.liveSessions(props.address),
      queryFn: () =>
        props.getLiveSessionsByUser
          ? props.getLiveSessionsByUser(props.address, maxSessionSeconds)
          : Promise.resolve(props.getSessionsByUser(props.address)).then(
              (all: any) => ({
                sessions: all ?? [],
                nextOffset: (all ?? []).length,
                complete: true,
              }),
            ),
      staleTime: 0,
    });
    const tail =
      queryClient.getQueryData<any[]>(
        queryKeys.sessionsTail(props.address, live?.nextOffset),
      ) ?? [];
    const fresh = [...(live?.sessions ?? []), ...tail];
    const models = allModels ?? [];
    return (fresh || []).reduce((res, item) => {
      const sessionModel = models.find((x) => x.Id == item.ModelAgentId);
      if (sessionModel) {
        res.push({ ...item, ModelName: sessionModel.Name });
      }
      return res;
    }, []);
  };

  const closeSession = async (sessionId: string) => {
    // Stop only the run whose CURRENT block is the session being closed — the
    // user closed that thread's session, not every thread's. An argument-less
    // stop here would silently end auto-renewal for every other chat, which is
    // both surprising and expensive (their next block never opens).
    // Match against EVERY block the run has opened, not just its current one.
    // Through the seamless overlap a run has two open blocks and the drawer
    // offers Close on both; matching only the newest meant closing the older one
    // paid the early-close penalty (a live session lost ~2.7 MOR to exactly this
    // on 2026-07-16) AND left the run restaking regardless.
    const owner = Object.values(keepAlive.statuses).find(
      (s) =>
        s.running &&
        (keepAlive.sessionIdsByChat[s.chatId] || []).includes(sessionId),
    );
    if (owner) {
      keepAlive.stop(owner.chatId);
    }
    setIsActionLoading(true);
    await props.closeSession(sessionId);
    await refreshSessions();
    setIsActionLoading(false);

    // Optional-chained: a chat bound to a session that has since closed now
    // resolves activeSession to undefined (it must NOT adopt a sibling session),
    // so closing any session from the drawer while such a chat is open used to
    // throw here — the old model lookup always happened to find something.
    if (activeSession?.Id == sessionId) {
      const localModel = chainData?.models?.find((m: any) => m.isLocal);
      if (localModel) {
        setSelectedModel(localModel);
        setChat({
          id: generateHashId(),
          createdAt: new Date(),
          modelId: localModel.Id,
          isLocal: true,
        });
      }
      setMessages([]);
    }
  };

  const selectChat = async (chatData: ChatData) => {
    restoredOnceRef.current = true; // user chose a thread; never auto-restore over it
    // Deliberately does NOT stop anything. Viewing another thread must not end
    // its neighbours' auto-renewal — concurrent rolling sessions are the point,
    // and a chat you navigate away from keeps restaking until it hits its target
    // or you stop it explicitly. (This used to be a blanket keepAlive.stop().)
    setSelectedProviderBidId(null); // provider pin doesn't carry across chats
    const modelId = chatData.modelId;
    if (!modelId) {
      console.warn('Model ID is missed');
      return;
    }

    const selectedModel = chainData.isLocal
      ? chainData.models.find((m: any) => m.Id == modelId)
      : chainData.models.find((m: any) => m.Id == modelId && m.bids);
    setSelectedModel(selectedModel);
    setIsReadonly(false);

    setChat({ ...chatData });

    if (chatData.isLocal) {
      await loadChatHistory(chatData.id);
      return;
    }

    const openSessions = sessions.filter((s) => !isClosed(s));
    // Bind to the session THIS chat owns. The old lookup was
    // `openSessions.find(s => s.ModelAgentId == modelId)` — first open session
    // for the model — which meant two chats on one model always resolved to the
    // same session, and a second session with the same provider was unreachable
    // no matter how it was opened.
    //
    // Legacy chats (written before the router persisted sessionId) have none, so
    // they keep the old model-based behaviour rather than becoming unusable.
    // A chat whose bound session has since closed resolves to undefined and goes
    // readonly, which is the reopen path — not silently adopting someone else's
    // live session, which would bill this chat's prompts to another thread.
    // The clicked drawer row can be a STALE copy of the binding: a session
    // opened or reopened since the list was built lands in `chat`/`chatData`
    // state, and nothing refetches the titles query (refetchOnWindowFocus is
    // off). Taking the row at face value is what made a reopened session vanish
    // on the next switch — the user had paid for it and had to stake again.
    // Newest wins: live `chat` for this same chat, then the list, then the row.
    const listEntry = chatListRef.current.find((c) => c.id === chatData.id);
    const bound = {
      ...chatData,
      sessionId:
        (chat?.id === chatData.id ? chat?.sessionId : undefined) ??
        listEntry?.sessionId ??
        chatData.sessionId,
    };
    // The claimed set must also cover LIVE ROLLING runs. A rolling chat stakes
    // real MOR the moment it starts but only enters the drawer list after its
    // first prompt, so until then its block looked unowned and the legacy
    // fallback handed it to any unbound chat on the same model — whose prompts
    // were then billed to the rolling run's stake, and the router persisted that
    // theft. The mitigation was right; its input set was incomplete.
    // Persisted chat bindings, plus live runs AND ended-but-still-open ones.
    // The run maps are separate because closeSession must map an id to a LIVE
    // run only; entitlement is the broader question and needs both.
    const claimed = sessionsClaimedByOtherChats(chatListRef.current, bound.id);
    claimedSessionIds(
      keepAlive.sessionIdsByChat,
      keepAlive.retainedSessionIds,
      bound.id,
    ).forEach((id) => claimed.add(id));
    const openSession = resolveChatSession(openSessions, bound, claimed);
    setIsReadonly(!openSession);

    if (openSession) {
      setActiveSession(openSession);
      const activeBid = selectedModel?.bids?.find(
        (b) => b.Id == openSession.BidID,
      );
      setSelectedBid(activeBid);
    } else {
      setActiveSession(undefined);
      setSelectedBid(undefined);
    }

    await loadChatHistory(chatData.id);
    setTimeout(() => scrollToBottom('smooth'), 400);
  };

  const handleReopen = async (isDirectPay: boolean) => {
    const opened = await onOpenSession(true, isDirectPay);
    if (opened) {
      setIsReadonly(false);
    }
  };

  const registerScrollEvent = (register) => {
    cancelScroll = false;
    const handler = (event: any) => {
      const isUp = event.wheelDelta ? event.wheelDelta > 0 : event.deltaY < 0;
      if (isUp) {
        cancelScroll = true;
      } else {
        if (!chatBlockRef?.current || !cancelScroll) {
          return;
        }
        // Return scrolling if scrolled to div end
        if (
          chatBlockRef.current.offsetHeight + chatBlockRef.current.scrollTop >=
          chatBlockRef.current.scrollHeight
        ) {
          cancelScroll = false;
        }
      }
    };

    if (register) {
      chatBlockRef?.current?.addEventListener('wheel', handler);
    } else {
      chatBlockRef?.current?.removeEventListener('wheel', handler);
    }
  };

  const call = async (message) => {
    let memoState = [
      ...messages,
      { id: makeId(16), text: promptInput, ...userMessage },
    ];
    setMessages(memoState);
    scrollToBottom();

    const headers = {
      Accept: 'application/json',
    };
    if (isLocal) {
      headers['model_id'] = selectedModel.Id;
    } else {
      headers['session_id'] = activeSession.Id;
    }
    headers['chat_id'] = chat?.id;

    // Ship the full prior transcript so the model has conversation memory. dev
    // sent only the new turn (the router was meant to prepend history but a type
    // assertion silently dropped it), so every message was answered in
    // isolation. The router's own prepend is disabled (PROXY_FORWARD_CHAT_CONTEXT
    // = false) so these can't double up.
    const context = messages
      .filter(
        (m) => m && m.text && (m.role === 'user' || m.role === 'assistant'),
      )
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));
    const incommingMessage = { role: 'user', content: message };
    const payload = {
      stream: true,
      messages: [...context, incommingMessage],
    };

    const authHeaders = await props.client.getAuthHeaders();
    // If image take only last message
    const response = await fetch(
      `${props.config.chain.localProxyRouterUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          ...headers,
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      },
    ).catch((e) => {
      console.log('Failed to send request', e);
      return null;
    });

    if (!response) {
      return;
    }

    if (!response.ok) {
      console.log('Failed', await response.json());
      props.toasts.toast('error', 'Failed to send prompt');
      return;
    }

    if (!response.body) {
      console.error('Body is missed');
      return;
    }

    registerScrollEvent(true);

    const textDecoder = new TextDecoder();
    const reader = response.body.getReader();

    const icon = modelName.toUpperCase()[0];
    const iconProps = {
      icon,
      color: getColor(icon),
      user: modelName,
      role: 'assistant',
    };
    try {
      let chunksBuffer = '';
      while (true) {
        if (abort) {
          await reader.cancel();
          abort = false;
        }

        const { value, done } = await reader.read();
        if (done) {
          setIsSpinning(false);
          break;
        }

        const decodedString = textDecoder.decode(value, { stream: true });

        chunksBuffer = chunksBuffer + decodedString;

        const { data: parts, isChunkIncomplete } =
          tryParseDataChunk(chunksBuffer);

        if (isChunkIncomplete) {
          continue;
        } else {
          chunksBuffer = '';
        }

        parts.forEach((part) => {
          if (!part) {
            return;
          }

          if (part.error) {
            console.warn(part.error);
            return;
          }

          if (typeof part === 'string') {
            handleSystemMessage(part);
            return;
          }

          const imageContent = part.imageUrl;
          const imageRawContent = part.imageRawContent;
          const videoRawContent = part.videoRawContent;

          if (
            !part?.id &&
            !imageContent &&
            !videoRawContent &&
            !imageRawContent
          ) {
            return;
          }

          let result: any[] = [];
          const message = memoState.find((m) => m.id == part.id);
          const otherMessages = memoState.filter((m) => m.id != part.id);

          if (imageRawContent) {
            result = [
              ...otherMessages,
              {
                id: makeId(16),
                text: imageRawContent,
                isImageContent: true,
                ...iconProps,
              },
            ];
          } else if (imageContent) {
            result = [
              ...otherMessages,
              {
                id: part.job,
                text: imageContent,
                isImageContent: true,
                ...iconProps,
              },
            ];
          } else if (videoRawContent) {
            result = [
              ...otherMessages,
              {
                id: part.job,
                text: videoRawContent,
                isVideoRawContent: true,
                ...iconProps,
              },
            ];
          } else {
            const text =
              `${message?.text || ''}${part?.choices[0]?.delta?.content || ''}`
                .replace('<|im_start|>', '')
                .replace('<|im_end|>', '');
            result = [
              ...otherMessages,
              { id: part.id, text: text, ...iconProps },
            ];
          }
          memoState = result;
          setMessages(result);
          scrollToBottom();
        });
      }
    } catch (e) {
      props.toasts.toast('error', 'Something goes wrong. Try later.');
      console.error(e);
    }

    registerScrollEvent(false);
    return memoState;
  };

  const buildAudioHeaders = async () => {
    const headers: Record<string, string> = {};
    if (isLocal) {
      headers['model_id'] = selectedModel.Id;
    } else {
      headers['session_id'] = activeSession.Id;
    }
    if (chat?.id) {
      headers['chat_id'] = chat.id;
    }
    const authHeaders = await props.client.getAuthHeaders();
    return { ...headers, ...authHeaders };
  };

  const audioIconProps = () => {
    const icon = modelName.toUpperCase()[0];
    return {
      icon,
      color: getColor(icon),
      user: modelName,
      role: 'assistant',
    };
  };

  // TTS: text in -> synthesized audio out
  const callSpeech = async (text: string) => {
    const userText = { id: makeId(16), text, ...userMessage };
    let memoState = [...messages, userText];
    setMessages(memoState);
    scrollToBottom();

    try {
      const headers = await buildAudioHeaders();
      const response = await fetch(
        `${props.config.chain.localProxyRouterUrl}/v1/audio/speech`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: text,
            voice: ttsVoice,
            response_format: 'mp3',
            speed: Number(ttsSpeed),
          }),
        },
      );

      if (!response || !response.ok) {
        props.toasts.toast('error', 'Failed to synthesize speech');
        return memoState;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      memoState = [
        ...memoState,
        { id: makeId(16), text: url, isAudioContent: true, ...audioIconProps() },
      ];
      setMessages(memoState);
      scrollToBottom();
    } catch (e) {
      props.toasts.toast('error', 'Something goes wrong. Try later.');
      console.error(e);
    }
    return memoState;
  };

  // STT: audio in -> transcription text out
  const callTranscription = async (file: File) => {
    const userAudioUrl = URL.createObjectURL(file);
    let memoState = [
      ...messages,
      {
        id: makeId(16),
        text: userAudioUrl,
        isAudioContent: true,
        ...userMessage,
      },
    ];
    setMessages(memoState);
    scrollToBottom();

    if (messages.length === 0 && chat) {
      // Upsert for the same reason as the text path below.
      setChatsData(
        upsertChat(chatData, {
          ...chat,
          title: file.name || 'Transcription',
        }),
      );
    }

    try {
      const headers = await buildAudioHeaders();
      const form = new FormData();
      form.append('file', file);
      form.append('response_format', 'json');

      // NB: do not set Content-Type; the browser adds the multipart boundary.
      const response = await fetch(
        `${props.config.chain.localProxyRouterUrl}/v1/audio/transcriptions`,
        {
          method: 'POST',
          headers,
          body: form,
        },
      );

      if (!response || !response.ok) {
        props.toasts.toast('error', 'Failed to transcribe audio');
        return memoState;
      }

      const contentType = response.headers.get('content-type') || '';
      let transcript = '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        transcript = data?.text ?? JSON.stringify(data);
      } else {
        transcript = await response.text();
      }

      memoState = [
        ...memoState,
        { id: makeId(16), text: transcript, ...audioIconProps() },
      ];
      setMessages(memoState);
      scrollToBottom();
    } catch (e) {
      props.toasts.toast('error', 'Something goes wrong. Try later.');
      console.error(e);
    }
    return memoState;
  };

  const handleAudioFile = (file?: File | null) => {
    if (!file || isDisabled) {
      return;
    }
    setIsSpinning(true);
    callTranscription(file).finally(() => setIsSpinning(false));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Detect a silent/muted input (e.g. macOS handing us a denied mic track):
      // sample the peak amplitude while recording so we can warn the user
      // instead of submitting silence that transcribes to garbage.
      peakLevelRef.current = 0;
      try {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioCtx();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const sampleLevel = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            peak = Math.max(peak, Math.abs(data[i] - 128));
          }
          peakLevelRef.current = Math.max(peakLevelRef.current, peak);
          levelRafRef.current = requestAnimationFrame(sampleLevel);
        };
        sampleLevel();
      } catch (levelErr) {
        console.warn('Could not set up audio level monitoring', levelErr);
      }

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (levelRafRef.current != null) {
          cancelAnimationFrame(levelRafRef.current);
          levelRafRef.current = null;
        }
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;

        // Peak is 0..127 (deviation from the 128 silence midpoint). A few
        // counts of jitter is still effectively silence.
        if (peakLevelRef.current <= 2) {
          props.toasts.toast(
            'error',
            'No sound was captured. Check microphone permissions and that the correct input device is selected.',
          );
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `recording-${Date.now()}.webm`, {
          type: 'audio/webm',
        });
        handleAudioFile(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      props.toasts.toast('error', 'Microphone access was denied');
      console.error(e);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  const handleSystemMessage = (message) => {
    const openSessionEventMessage = 'new session opened';
    const failoverTurnOnMessage = 'provider failed, failover enabled';

    const renderMessage = (value) => {
      props.toasts.toast('info', value, {
        autoClose: 1500,
      });
    };

    if (message.includes(openSessionEventMessage)) {
      const sessionId = message.split(':')[1].trim(); // new session opened: 0x123456
      setSessionData(sessionId).catch((err) =>
        renderMessage(`Failed to load session data: ${err.message}`),
      );
      renderMessage('Opening session with available provider...');
      return;
    }
    if (message.includes(failoverTurnOnMessage)) {
      renderMessage('Target provider unavailable. Applying failover policy...');
      return;
    }
    renderMessage(message);
    return;
  };

  const handleSubmit = () => {
    if (abort) {
      abort = false;
    }

    if (isSpinning) {
      abort = true;
      setIsSpinning(false);
      return;
    }

    if (!promptInput) {
      return;
    }

    if (messages.length === 0 && chat) {
      const title = { ...chat, title: promptInput };
      // Upsert, don't append. "No messages yet" is not the same as "not in the
      // list": a chat restored from the drawer with an empty transcript is
      // already there, and appending gave two rows with the same key — React
      // warns that duplicate keys may duplicate or OMIT children, so a chat can
      // vanish from the sidebar. Pre-existing; surfaced by the restore tests.
      setChatsData(upsertChat(chatData, title));
    }

    setIsSpinning(true);
    const request = modality === 'tts' ? callSpeech(promptInput) : call(promptInput);
    request.finally(() => setIsSpinning(false));
    setPromptInput('');
  };

  const deleteChatEntry = (id: string) => {
    props.client
      .deleteChatHistory(id)
      .then(() => {
        const newChats = chatData.filter((x) => x.id != id);
        setChatsData(newChats);
      })
      .catch(console.error);
  };

  const calculateStake = (pricePerSecond, durationInMin) => {
    const totalCost = pricePerSecond * durationInMin * 60;
    const stake = (totalCost * Number(meta.supply)) / Number(meta.budget);
    return stake;
  };

  // Per-provider affordability. A model is served by several providers (bids) at
  // DIFFERENT prices, and opening a session matches you to ONE of them. Staking
  // used to require enough MOR for the MOST EXPENSIVE provider, so a wallet that
  // could comfortably afford the cheaper providers was blocked outright. Instead,
  // gate on the CHEAPEST provider (you may stake as long as at least one provider
  // is affordable) and surface how many of the model's providers you can afford.
  //
  // A provider is "affordable" when its stake for the length being bought is
  // within balance. That length is a PARAMETER now that the user types it: a
  // wallet that can fund six minutes usually cannot fund a year, and judging
  // affordability at the old fixed 6-minute floor would light up a Stake button
  // whose open then reverts — after the user has paid gas to find out.
  //
  // The session duration is sized off the priciest AFFORDABLE provider
  // (`priceForDuration`), so whichever affordable provider the router matches,
  // the stake still fits within balance. The router independently skips any
  // provider the wallet can't cover (OpenSessionByModelId in proxy-router), so
  // the client's "affordable set" and the provider the router actually picks
  // stay consistent.
  const getStakeAffordability = (
    bids: any[],
    balance: number,
    durationSec: number = MIN_REQUEST_SECONDS,
  ) => {
    const prices = (bids ?? [])
      .map((b: any) => Number(b.PricePerSecond))
      .filter((p) => Number.isFinite(p) && p > 0);
    const empty = {
      known: false,
      totalProviders: prices.length,
      affordableCount: 0,
      minPrice: 0,
      minStake: 0,
      priceForDuration: 0,
    };
    if (!prices.length || !Number(meta.supply) || !Number(meta.budget)) {
      return empty;
    }
    const minStakeFor = (price: number) => calculateStake(price, durationSec / 60);
    const affordablePrices = prices.filter((p) => balance >= minStakeFor(p));
    const minPrice = Math.min(...prices);
    // Priciest provider we can still afford; falls back to the cheapest so the
    // duration math stays defined even when nothing is affordable (the caller
    // gates on affordableCount before it ever opens a session).
    const priceForDuration = affordablePrices.length
      ? Math.max(...affordablePrices)
      : minPrice;
    return {
      known: true,
      totalProviders: prices.length,
      affordableCount: affordablePrices.length,
      minPrice,
      minStake: minStakeFor(minPrice),
      priceForDuration,
    };
  };

  // The stake depends on two async inputs — the model's bids AND the marketplace
  // meta (supply/budget). Recompute whenever either lands, so a reopened session
  // (opened without going through onCreateNewChat) gets the real requirement
  // instead of the {min:0, max:0} default that makes the duration fall back to
  // 24h. Idempotent with onCreateNewChat (same formula), so no conflict.
  useEffect(() => {
    const aff = getStakeAffordability(
      selectedModel?.bids,
      Number(balances.mor),
    );
    if (!aff.known) return;
    // min = cheapest provider's 6-minute floor (what it takes to stake at all);
    // max = priciest AFFORDABLE provider at 24h (the ceiling of a session the
    // wallet can actually open — also what calculateAcceptableDuration reads).
    setRequiredStake({
      min: aff.minStake,
      max: calculateStake(aff.priceForDuration, 24 * 60),
    });
  }, [selectedModel, meta.supply, meta.budget, balances.mor]);

  const onCreateNewChat = ({ modelId, isLocal }) => {
    restoredOnceRef.current = true; // user chose a thread; never auto-restore over it
    // No stop(): opening a new thread must leave every existing rolling session
    // renewing. This was a blanket keepAlive.stop(), so "new chat" silently
    // ended the run you had just paid to keep alive.
    setSelectedProviderBidId(null); // provider pin doesn't carry across models
    abort = true;
    setMessages([]);
    setActiveSession(undefined);
    setSelectedBid(undefined);
    setIsReadonly(false);
    setChat({ id: generateHashId(), createdAt: new Date(), modelId, isLocal });

    const selectedModel = isLocal
      ? chainData.models.find((m: any) => m.Id == modelId)
      : chainData.models.find((m: any) => m.Id == modelId && m.bids);

    // Marketplace selection needs the bid list, which may still be loading on a
    // cold first visit. Guard instead of dereferencing undefined bids.
    if (!isLocal && !selectedModel) {
      props.toasts.toast(
        'info',
        'Model options are still loading. Please try again in a moment.',
      );
      return;
    }

    setSelectedModel(selectedModel);

    if (isLocal) {
      setActiveSession(undefined);
      setSelectedBid(undefined);
      return;
    }

    // A new chat starts UNBOUND, even when this model already has an open
    // session. It used to adopt the first open session for the model and return
    // early, which is precisely why a second concurrent session was impossible:
    // every new chat was funnelled back into the existing one. Falling through to
    // the stake UI lets this chat open its own session — pin the same provider
    // and you get a second session with them, which the contract allows (the
    // sessionId nonce makes it distinct) and the router routes by session id.
    //
    // The cost is real: a new chat on a model you already have open now asks for
    // its own stake instead of riding the existing one for free.
    //
    // The stake screen names any already-open sessions on this model so the
    // second payment is a choice rather than a surprise (see renderChatBlock's
    // openSessionsForThisModel).
    const aff = getStakeAffordability(selectedModel.bids, Number(balances.mor));
    setRequiredStake({
      min: aff.minStake,
      max: calculateStake(aff.priceForDuration, 24 * 60),
    });
  };

  const wrapChangeTitle = async (data: { id; title }) => {
    await props.client.updateChatHistoryTitle(data);
  };

  const renderChatBlock = () => {
    const isNewChat = !messages?.length;
    // Paid, still-open sessions on the model this chat is about to stake for.
    const openSessionsForThisModel = selectedModel?.Id
      ? sessions.filter(
          (s) => !isClosed(s) && s.ModelAgentId == selectedModel.Id,
        ).length
      : 0;
    // A keep-alive run has started (timer running) but its first block hasn't
    // been mirrored into activeSession yet — a transient "opening…" state, not a
    // reason to show the payment screen.
    const isKeepAliveStarting = !!myRun?.running && !activeSession;
    const isCreateSessionMode =
      isNewChat &&
      !isLocal &&
      !activeSession &&
      !isLoading &&
      !isKeepAliveStarting;

    // Stake mode: gate on the CHEAPEST provider — enough to stake if at least one
    // of the model's providers is affordable. `known` is false until bids AND
    // marketplace meta have loaded, so an unpriced model reads as not-yet-payable
    // rather than falsely affordable.
    const affordability = getStakeAffordability(
      selectedModel?.bids,
      Number(balances.mor),
      sessionBlockSeconds,
    );
    const stakeKnown = affordability.known;
    // What one block of the chosen length costs, priced exactly as startSession
    // prices it — pinned provider if one is chosen, else the priciest affordable
    // one (the provider the router would size against). The disclosure and the
    // gate must quote the SAME number; two formulas is how they drift.
    const previewBid = selectedProviderBidId
      ? (selectedModel?.bids ?? []).find(
          (b: any) => b.Id == selectedProviderBidId,
        )
      : null;
    const stakePreviewWei = stakeKnown
      ? Number(
          calculateStake(
            previewBid
              ? Number(previewBid.PricePerSecond)
              : affordability.priceForDuration,
            sessionBlockSeconds / 60,
          ),
        )
      : 0;
    const isEnoughFunds = stakeKnown && affordability.affordableCount >= 1;
    // You can afford SOME but not ALL providers — the session will match one of
    // the affordable ones; tell the user how many that is.
    const partiallyAffordable =
      stakeKnown &&
      affordability.affordableCount >= 1 &&
      affordability.affordableCount < affordability.totalProviders;

    // Direct pay is billed price x duration OUTRIGHT — tryOpenSession transfers
    // exactly computeSessionTokenAmount(), and for direct pay that is the whole
    // sessionCost, with no stake formula to shrink it. Its duration is also not
    // price-derived: calculateAcceptableDurationForDirectPay returns a fixed
    // stake-equivalent window (a contract-bug workaround) that can run to days.
    // So pricing this gate off the 6-minute floor understated the true cost by
    // orders of magnitude and lit up a Direct Pay button whose session the
    // router then refused, provider by provider. Price it off the duration
    // actually opened, cheapest provider first ("can we afford anyone at all?").
    // Gated on stakeKnown so an unloaded meta reads as not-yet-payable — without
    // it, supply=0 collapses the duration to 1s and everything looks free.
    const directPayDuration = stakeKnown
      ? calculateAcceptableDurationForDirectPay(meta)
      : 0;
    const requiredStakeForDirectPay =
      affordability.minPrice * directPayDuration;
    const isEnoughFundsForDirectPay =
      requiredStakeForDirectPay > 0 &&
      Number(balances.mor) >= requiredStakeForDirectPay;
    // When neither path is affordable, offer a way forward (add MOR) instead of
    // two dead, greyed-out buttons.
    //
    // Asked at the SHORTEST session the chain sells, never at the typed length.
    // This branch replaces the ENTIRE panel — including the length field itself —
    // so wiring it to the typed length meant that typing a duration you could not
    // afford yanked the input out from under the cursor mid-keystroke. "Can I use
    // this model at all?" is a question about the minimum; "can I afford THIS
    // length?" is answered by the disclosure and the disabled Stake button, which
    // is where an answer belongs that changes with every character.
    const floorAffordability = getStakeAffordability(
      selectedModel?.bids,
      Number(balances.mor),
      MIN_REQUEST_SECONDS,
    );
    const cannotPayAtAll =
      floorAffordability.known &&
      floorAffordability.affordableCount < 1 &&
      !isEnoughFundsForDirectPay;

    return (
      <>
        {isKeepAliveStarting ? (
          <ChatIntroContainer>
            <ChatIntroInner>
              <ChatIntroInnerTitle>
                Starting your session…
              </ChatIntroInnerTitle>
              <ChatIntroInnerText>
                Opening the first block — this can take a few seconds while the
                stake confirms on-chain.
              </ChatIntroInnerText>
            </ChatIntroInner>
          </ChatIntroContainer>
        ) : isCreateSessionMode ? (
          <ChatIntroContainer>
            <ChatIntroInner>
              {cannotPayAtAll ? (
                <>
                  <ChatIntroInnerTitle>You’ll need some MOR</ChatIntroInnerTitle>
                  <ChatIntroInnerText>
                    Opening a session needs at least{' '}
                    {formatMor(requiredStake.min, 18) ?? '…'} MOR to stake (or
                    enough to pay a provider directly). Add MOR to your wallet,
                    then come back to start a session.
                  </ChatIntroInnerText>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ChatIntroButton
                      onClick={() =>
                        navigate('/wallet', { state: { openModal: 'receive' } })
                      }
                    >
                      Receive MOR
                    </ChatIntroButton>
                  </div>
                </>
              ) : (
                <>
                  <ChatIntroInnerTitle>
                    Select payment method
                  </ChatIntroInnerTitle>
                  {/* Say it out loud when this model ALREADY has paid, open
                      sessions. A new chat no longer rides an existing session
                      (that reuse is what made a second concurrent session
                      unreachable), so staking here is a SECOND payment — and it
                      used to happen with no signal whatsoever. */}
                  {openSessionsForThisModel > 0 && (
                    <ChatIntroInnerText>
                      You already have {openSessionsForThisModel} open session
                      {openSessionsForThisModel > 1 ? 's' : ''} on this model.
                      Staking here opens an additional one — a separate payment,
                      billed separately. Use the chat history to return to an
                      existing session instead.
                    </ChatIntroInnerText>
                  )}
                  {/* The direction of causation is the whole change: the length
                      is chosen and the stake follows it. The old copy said the
                      reverse ("session will last ... depending on the amount you
                      stake"), and promised a 24h claim — which is what happens
                      after an EARLY close, not after a session that runs out. */}
                  {/* Reference prices for THIS model, not a ceiling. Calling the
                      day figure "max" read as a limit — and sat two lines above
                      a 604.80 MOR quote for a longer session, which is the page
                      disagreeing with itself about money. */}
                  <ChatIntroInnerText>
                    Stake MOR for compute. You set the length above and the stake
                    follows it — this model costs about{' '}
                    {formatMor(requiredStake.min, 18) ?? '…'} MOR for 5 minutes,
                    or {formatMor(requiredStake.max, 18) ?? '…'} MOR for a day.
                    The stake is collateral, not a fee — it is locked for the
                    session and returned when it ends.
                  </ChatIntroInnerText>
                  {/* Always mounted, hidden when it does not apply — the notice
                      tracks the typed length, so conditional mounting made three
                      lines pop in and out between keystrokes. `visibility` keeps
                      the space AND keeps hidden text out of the a11y tree. */}
                  <ReservedNotice $shown={partiallyAffordable}>
                    <ChatIntroWarningText>
                      Heads up: your MOR balance covers{' '}
                      {partiallyAffordable ? affordability.affordableCount : 0}{' '}
                      of {affordability.totalProviders} providers for this
                      model. Your session will use one of the providers you can
                      afford — add more MOR to unlock the rest.
                    </ChatIntroWarningText>
                  </ReservedNotice>
                  <KeepAliveRow>
                    <KeepAliveLabel>Provider</KeepAliveLabel>
                    <KeepAliveChip
                      $active={selectedProviderBidId === null}
                      onClick={() => setSelectedProviderBidId(null)}
                      title="Let the router pick an available provider each block"
                    >
                      Auto
                    </KeepAliveChip>
                    {(selectedModel?.bids ?? []).map((bid: any) => {
                      const status = providersAvailability.find(
                        (a: any) => a.id == bid.Provider,
                      )?.status;
                      const dot =
                        status === 'available'
                          ? '#4ade80'
                          : status === 'disconnected'
                            ? '#f87171'
                            : '#9ca3af';
                      // Price the chip at the length the user actually typed —
                      // a fixed 6-minute quote next to a "1 day" field is the
                      // wrong number in the one place it must be right.
                      const stakeWei = Number(
                        calculateStake(
                          Number(bid.PricePerSecond),
                          sessionBlockSeconds / 60,
                        ),
                      );
                      // Can't afford this provider at the chosen length.
                      const unaffordable =
                        Number.isFinite(stakeWei) &&
                        stakeWei > Number(balances.mor);
                      const stakeForLength = formatMor(stakeWei, 18);
                      return (
                        <KeepAliveChip
                          key={bid.Id}
                          $active={selectedProviderBidId === bid.Id}
                          disabled={unaffordable}
                          onClick={() =>
                            !unaffordable && setSelectedProviderBidId(bid.Id)
                          }
                          title={`${bid.Provider} · ${status ?? 'unknown'}${
                            unaffordable
                              ? " · can't afford this length"
                              : ''
                          }`}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: '0.55rem',
                              height: '0.55rem',
                              borderRadius: '50%',
                              marginRight: '0.4rem',
                              background: dot,
                              verticalAlign: 'middle',
                            }}
                          />
                          {providerLabel(bid.Provider)}
                          {stakeForLength ? (
                            <>
                              {' · '}
                              <ChipStake>{stakeForLength}</ChipStake>
                            </>
                          ) : null}
                        </KeepAliveChip>
                      );
                    })}
                  </KeepAliveRow>
                  <KeepAliveRow>
                    <KeepAliveLabel>Session length</KeepAliveLabel>
                    {/* Free text with an OPTIONAL completion. Every alias parses
                        ("2y", "2 yrs", "2 years"); the menu only saves typing
                        and Tab finishes the unit — neither constrains the field.
                        Hand-built rather than a native <datalist> because that
                        is drawn by browser chrome: unstyleable, so it dropped a
                        stock OS list into a themed money surface, and it gives
                        no hook for Tab completion. */}
                    <SessionLengthField>
                      <SessionLengthInput
                        value={sessionLengthInput}
                        $invalid={!!lengthErrorText}
                        aria-label="Session length"
                        aria-invalid={!!lengthErrorText}
                        aria-autocomplete="list"
                        aria-expanded={lengthMenuOpen}
                        role="combobox"
                        placeholder="e.g. 1 day"
                        onChange={(e) => {
                          setSessionLengthInput(e.target.value);
                          setLengthMenuOpen(true);
                          setLengthMenuIndex(0);
                        }}
                        onKeyDown={onLengthKeyDown}
                        onBlur={() => setLengthMenuOpen(false)}
                      />
                      {lengthMenuOpen && lengthSuggestions.length > 0 && (
                        <SessionLengthMenu role="listbox">
                          {lengthSuggestions.map((s) => {
                            const active = s === activeSuggestion;
                            return (
                              <SessionLengthOption
                                key={s}
                                role="option"
                                aria-selected={active}
                                $active={active}
                                // mouseDown, not click: click fires after blur,
                                // and blur closes the menu — so the option would
                                // be gone before the click landed on it.
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  acceptLengthSuggestion(s);
                                }}
                              >
                                <span>{s}</span>
                                {active && (
                                  <SessionLengthOptionHint>
                                    Tab
                                  </SessionLengthOptionHint>
                                )}
                              </SessionLengthOption>
                            );
                          })}
                        </SessionLengthMenu>
                      )}
                    </SessionLengthField>
                    {/* Echo what was ASKED for, not the 5s-cushioned value we
                        open with — "5 minutes 5 seconds" reads as the app
                        correcting a number the user got right. Always mounted so
                        the row keeps its width between keystrokes. */}
                    <SessionLengthValue>
                      {sessionLengthValid ? formatDurationLong(askedSec) : ''}
                    </SessionLengthValue>
                  </KeepAliveRow>
                  {lengthErrorText ? (
                    <SessionLengthError>{lengthErrorText}</SessionLengthError>
                  ) : (
                    /* The stake is refundable collateral, not a fee — but it is
                       locked for the whole session, so the amount and when it
                       comes back are the two facts this choice turns on. State
                       both, in MOR, before anything is signed. */
                    <SessionLengthNote>
                      {!sessionLengthValid ? (
                        'Type how long you want the session to run — the length sets the stake.'
                      ) : !stakeKnown ? (
                        // Never quote a number before the marketplace figures
                        // that price it have loaded. formatMor(0) renders "0",
                        // so the un-loaded state used to read as a free session.
                        'Pricing this length…'
                      ) : sessionRenews ? (
                        <>
                          Longer than the network allows in one session, so it
                          runs as{' '}
                          <strong>{sessionBlockCount} sessions</strong> of up to{' '}
                          {formatDurationLong(sessionBlockSeconds)}, staking
                          about {formatMor(stakePreviewWei, 18) ?? '…'} MOR each.
                          You need{' '}
                          <strong>
                            {formatMor(
                              stakePreviewWei * sessionPeakStakes,
                              18,
                            ) ?? '…'}{' '}
                            MOR
                          </strong>{' '}
                          free to start — a renewal opens before the previous
                          stake comes back, and each one returns at the end of
                          the day it closes.{' '}
                          {/* This said the stakes ACCUMULATE across renewals
                              and never come back between them, which read as
                              "a 1-year plan needs 53x a block's stake". The
                              gate 30 lines up charges the PEAK, not the sum,
                              and the peak is what the wallet actually has to
                              carry: a block's hold clears by the end of the day
                              it closed, which at the 7-day cap is six days
                              before the next block opens. Quote the same number
                              the gate enforces, computed from the same
                              function, so the screen cannot disagree with the
                              refusal it is about to show. */}
                          Each is priced again when it opens, so this is a plan,
                          not a purchase — and it lasts only as long as the app
                          keeps running.
                        </>
                      ) : (
                        <>
                          Stakes about{' '}
                          <strong>
                            {formatMor(stakePreviewWei, 18) ?? '…'} MOR
                          </strong>
                          , which is locked until the{' '}
                          <strong>end of the day</strong>.
                        </>
                      )}
                    </SessionLengthNote>
                  )}
                  {/* Renewing only exists when the plan actually has more than
                      one block. A session that runs to its end and stops has
                      nothing to rotate, so offering the choice would be asking
                      the user to decide something with no effect — and just past
                      the cap, "longer than one session" and "more than one
                      block" are NOT the same question (see sessionBlockCount). */}
                  {sessionRenews && (
                    <>
                      <KeepAliveRow>
                        <KeepAliveLabel>Renewing</KeepAliveLabel>
                        {/* The labels no longer quote a stake multiple. They
                            read "2× stake" and "1× stake", which contradicted
                            the sentence right below them and, worse, priced a
                            saving that does not exist: both modes cost the same
                            because a closed block's stake is locked to the end
                            of the day either way. The only real difference is
                            whether inference pauses at each renewal. */}
                        <KeepAliveChip
                          $active={restakeMode === 'seamless'}
                          onClick={() => setRestakeMode('seamless')}
                        >
                          Seamless · no pause
                        </KeepAliveChip>
                        <KeepAliveChip
                          $active={restakeMode === 'economy'}
                          onClick={() => setRestakeMode('economy')}
                        >
                          Sequential · brief gap
                        </KeepAliveChip>
                      </KeepAliveRow>
                      <ChatIntroInnerText style={{ marginTop: '0.4rem' }}>
                        {restakeMode === 'seamless'
                          ? `Seamless: the next session opens before the current one ends, so inference never pauses. The previous stake is still locked when the next one opens, so keep the figure above free — not just one session's worth.`
                          : `Sequential: the next session opens only after the current one expires, so there is a short gap in inference. It costs exactly the same — MOR is locked until the end of the day either way, so each renewal needs new MOR rather than reusing the last stake. Pick this only if an overlap would be a problem.`}
                      </ChatIntroInnerText>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ChatIntroButton
                      onClick={() => startSession(false)}
                      disabled={!isEnoughFunds || !sessionLengthValid}
                    >
                      Stake MOR
                    </ChatIntroButton>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ChatIntroButton
                      onClick={() => onOpenSession(false, true)}
                      disabled={!isEnoughFundsForDirectPay}
                    >
                      Direct Pay
                    </ChatIntroButton>
                  </div>
                </>
              )}
            </ChatIntroInner>
          </ChatIntroContainer>
        ) : (
          <ChatHistoryContainer>
            {messages?.map((x, index) => (
              <Message key={index} message={x} onOpenImage={setImagePreview} />
            ))}
          </ChatHistoryContainer>
        )}
      </>
    );
  };

  return (
    <>
      {isLoading && (
        <LoadingCover>
          <Spinner
            style={{ width: '5rem', height: '5rem' }}
            animation="border"
            variant="success"
          />
        </LoadingCover>
      )}
      <HistoryDrawer open={isOpen} onClose={toggleDrawer} direction="right">
        <ChatHistory
          activeChat={chat}
          open={isOpen}
          chatData={chatData}
          sessions={sessions}
          deleteHistory={deleteChatEntry}
          models={chainData?.models || []}
          onSelectChat={selectChat}
          refreshSessions={async () => {
            setIsActionLoading(true);
            await refreshSessions();
            setIsActionLoading(false);
          }}
          onChangeTitle={wrapChangeTitle}
          onCloseSession={closeSession}
        />
      </HistoryDrawer>
      <View>
        {/* One header, not two stacked toolbars: the model is identified
            calmly (name as a label), its cost is stated in words, and the
            utility actions sit quietly on the right. */}
        <ChatHeader>
          <ChatIdentity>
            <ModelGlyph aria-hidden $thinking={isSpinning}>◈</ModelGlyph>
            <ModelMeta>
              <ModelName>
                <LiveDot />
                {formatModelName(modelName)}
                {isSecure && (
                  <SecureBadge title={SECURE_BADGE_TOOLTIP}>
                    <IconShieldLock size={12} stroke={2.2} /> Secure
                  </SecureBadge>
                )}
              </ModelName>
              <ModelSubline>
                {isLocal ? (
                  'Runs on your machine · free'
                ) : (
                  <>
                    <span title={providerAddress}>{providerAddress}</span>
                    {' · '}
                    {stakedFunds} MOR staked
                    {/* One timer. During a chained session it counts down the
                        TOTAL time remaining, not the current 6-min block. */}
                    {(myRun?.running || activeSession?.EndsAt) && (
                      <>
                        {' · '}
                        <Cooldown
                          endDate={
                            myRun?.running
                              ? myRun.targetEndTime
                              : activeSession?.EndsAt
                          }
                        />
                      </>
                    )}
                  </>
                )}
              </ModelSubline>
            </ModelMeta>
          </ChatIdentity>

          <HeaderActions>
            {/* The ONLY way to end a running session. Chat-switch and New-chat used
                to stop it implicitly, and removing those (so runs survive
                navigation) left no control at all while the stake copy promised
                "Stop anytime" — a run would keep restaking for up to 8 hours.
                Stops scheduling only; the current block lapses on its own, which
                is what avoids the ~24h early-close lock. */}
            {myRun?.running && (
              <HeaderBtn
                onClick={() => chat?.id && keepAlive.stop(chat.id)}
                title="Stop auto-renewing this session (the current block runs out on its own)"
              >
                <IconPlayerStopFilled size={16} /> Stop renewing
              </HeaderBtn>
            )}
            {/* Runs elsewhere must be stoppable from HERE. A running chat has no
                file until its first prompt, so it never appears in the drawer,
                and the per-chat Stop above only renders inside that chat — a run
                started and navigated away from before typing was unreachable and
                unstoppable, leaving the Sessions-tab Close (the ~24h early-close
                lock) as the only control. Stops scheduling only; every current
                block still lapses naturally. */}
            {keepAlive.runningCount - (myRun?.running ? 1 : 0) > 0 && (
              <HeaderBtn
                onClick={() => keepAlive.stop()}
                title={`Stop auto-renewing on ${keepAlive.runningCount - (myRun?.running ? 1 : 0)} other chat(s). Their current blocks run out on their own — nothing is closed early.`}
              >
                <IconPlayerStopFilled size={16} /> Stop all renewing (
                {keepAlive.runningCount - (myRun?.running ? 1 : 0)})
              </HeaderBtn>
            )}
            <HeaderBtn onClick={toggleDrawer} title="Chat history">
              <IconHistory size={18} stroke={1.75} />
            </HeaderBtn>
            <HeaderBtn onClick={() => setOpenChangeModal(true)}>
              <IconMessagePlus size={18} stroke={1.75} /> New chat
            </HeaderBtn>
          </HeaderActions>
        </ChatHeader>

        {imagePreview && (
          <ImageViewer
            src={[imagePreview]}
            onClose={() => setImagePreview('')}
            disableScroll={false}
            backgroundStyle={{
              backgroundColor: 'rgba(0,0,0,0.9)',
              zIndex: 1000,
            }}
            closeOnClickOutside={true}
          />
        )}

        <Container>
          {/* An empty chat with a session/local model already ready is the
              best chance to teach the app — greet, state the cost in words,
              and offer starter prompts, instead of an undesigned blank void.
              This branch mirrors (never edits) renderChatBlock's own
              isNewChat / isCreateSessionMode gating using the same, already
              -computed values, so the payment-flow screens it still owns
              (Stake/Direct-Pay selection, the "need MOR" screen, and the
              message list) are untouched. */}
          {/* `activeSession` is NOT proof of an open session: closeSession()
              clears `messages` but never clears `activeSession` (refreshSessions()
              fetches a list and discards it), so after closing a session with no
              local model registered this state still holds the just-closed one.
              Truthiness alone therefore told the user "you have an open session…
              you pay only for the time the session is open" about a CLOSED
              session — a false billing claim. Ask whether it is actually open.
              Falling through renders what dev rendered here: the chat block. */}
          {!messages?.length &&
          !isLoading &&
          (isLocal || (activeSession && !isClosed(activeSession))) ? (
            <EmptyState>
              <EmptyTitle>Ask {formatModelName(modelName)} anything</EmptyTitle>
              <EmptySubtitle>
                {isLocal
                  ? 'This model runs entirely on your machine. Nothing leaves your computer, it costs nothing, and it works offline.'
                  : 'You have an open session with this provider. Ask away — you pay only for the time the session is open.'}
              </EmptySubtitle>
              <PromptGrid>
                {[
                  {
                    icon: IconBulb,
                    label: 'Explain a hard idea in plain language',
                    prompt: 'Explain how large language models work, in plain language.',
                  },
                  {
                    icon: IconCode,
                    label: 'Help me write or debug code',
                    prompt: 'Help me debug this code:\n\n',
                  },
                  {
                    icon: IconListSearch,
                    label: 'Summarize something long',
                    prompt: 'Summarize the following text:\n\n',
                  },
                ].map(({ icon: Icon, label, prompt }) => (
                  <PromptCard
                    key={label}
                    type="button"
                    onClick={() => setPromptInput(prompt)}
                  >
                    <Icon size={18} stroke={1.75} />
                    <span>{label}</span>
                  </PromptCard>
                ))}
              </PromptGrid>
            </EmptyState>
          ) : (
            renderChatBlock()
          )}
          {/* The handoff offer. Dismissible, and it disappears once taken —
              it is an offer, not a nag. */}
          {opencodeOffer && (
            <OpencodeOffer>
              {opencodeState === 'launching' ? (
                <span>
                  <Spinner animation="border" size="sm" /> Starting opencode…
                </span>
              ) : opencodeState === 'launched' ? (
                /* Honest about what is known: the terminal was opened. Whether
                   opencode has finished booting happens outside this app and
                   cannot be observed from here. */
                <span>
                  Opened in your terminal — opencode is starting with{' '}
                  <strong>{opencodeOffer.modelName}</strong>.
                </span>
              ) : (
                <span>
                  Session open for <strong>{opencodeOffer.modelName}</strong>.
                  Use it from your terminal?
                </span>
              )}
              {opencodeState === 'idle' && (
                <OpencodeOfferActions>
                  <KeepAliveChip
                    $active
                    onClick={async () => {
                      setOpencodeState('launching');
                      try {
                        const result: any = await props.client.openInOpencode({
                          modelId: opencodeOffer.modelId,
                        });
                        if (result?.ok) {
                          setOpencodeState('launched');
                          // Leave the confirmation up long enough to read, then
                          // clear — the banner is an offer, not a status bar.
                          setTimeout(() => {
                            setOpencodeOffer(null);
                            setOpencodeState('idle');
                          }, 6000);
                        } else {
                          // Say why, and return to idle so it can be retried.
                          // A button that silently does nothing is the failure
                          // mode this whole flow exists to avoid.
                          setOpencodeState('idle');
                          props.toasts.toast(
                            'error',
                            result?.message ?? 'Could not open opencode.',
                          );
                        }
                      } catch (e: any) {
                        setOpencodeState('idle');
                        props.toasts.toast(
                          'error',
                          e?.message ?? 'Could not open opencode.',
                        );
                      }
                    }}
                  >
                    Open in opencode
                  </KeepAliveChip>
                  <KeepAliveChip onClick={() => setOpencodeOffer(null)}>
                    Not now
                  </KeepAliveChip>
                </OpencodeOfferActions>
              )}
            </OpencodeOffer>
          )}
          <Control>
            {modality === 'stt' && !isReadonly ? (
              <AudioInputZone data-disabled={isDisabled}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleAudioFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <AudioActionBtn
                  type="button"
                  disabled={isDisabled || isSpinning || recording}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <IconUpload size={16} /> Upload audio
                </AudioActionBtn>
                <AudioActionBtn
                  type="button"
                  data-recording={recording}
                  disabled={isDisabled || isSpinning}
                  onClick={() => (recording ? stopRecording() : startRecording())}
                >
                  {recording ? (
                    <>
                      <IconPlayerStopFilled size={16} /> Stop
                    </>
                  ) : (
                    <>
                      <IconMicrophone size={16} /> Record
                    </>
                  )}
                </AudioActionBtn>
                {isSpinning && <Spinner animation="border" size="sm" />}
                <AudioHint>
                  {recording
                    ? 'Recording… click Stop to transcribe.'
                    : 'Upload or record audio to transcribe.'}
                </AudioHint>
              </AudioInputZone>
            ) : (
              <>
                {modality === 'tts' && !isReadonly && (
                  <TtsControlsRow>
                    <label>
                      Voice
                      <input
                        type="text"
                        list="tts-voices"
                        value={ttsVoice}
                        onChange={(e) => setTtsVoice(e.target.value)}
                      />
                      <datalist id="tts-voices">
                        {TTS_VOICES.map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>
                    </label>
                    <label>
                      Speed
                      <input
                        type="range"
                        min={0.5}
                        max={2}
                        step={0.25}
                        value={ttsSpeed}
                        onChange={(e) => setTtsSpeed(Number(e.target.value))}
                      />
                      {ttsSpeed}x
                    </label>
                  </TtsControlsRow>
                )}
                {/* The composer is the point of this page, so it is the
                    dominant surface — an elevated card, rather than a
                    hairline box while "New chat" carried the loudest fill. */}
                <Composer>
                  <CustomTextArrea
                    disabled={isDisabled}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    value={promptInput}
                    onChange={(ev) => setPromptInput(ev.target.value)}
                    placeholder={
                      isReadonly
                        ? 'Session is closed. Chat in ReadOnly Mode'
                        : modality === 'tts'
                          ? 'Enter text to synthesize...'
                          : `Ask ${formatModelName(modelName)} anything...`
                    }
                    minRows={1}
                    maxRows={6}
                  />
                  <SendBtnWrapper>
                    {isReadonly ? (
                      <>
                        <Btn onClick={() => handleReopen(false)}>
                          {isSpinning ? (
                            <Spinner animation="border" />
                          ) : (
                            <span>Staking</span>
                          )}
                        </Btn>
                        <Btn onClick={() => handleReopen(true)}>
                          {isSpinning ? (
                            <Spinner animation="border" />
                          ) : (
                            <span>Direct Pay</span>
                          )}
                        </Btn>
                      </>
                    ) : (
                      <SendRoundBtn
                        disabled={isDisabled}
                        onClick={handleSubmit}
                        aria-label="Send"
                      >
                        {isSpinning ? (
                          <Spinner
                            animation="border"
                            style={{ width: '20px', height: '20px' }}
                          />
                        ) : (
                          <IconArrowUp size={'22px'}></IconArrowUp>
                        )}
                      </SendRoundBtn>
                    )}
                  </SendBtnWrapper>
                </Composer>
                <ComposerHint>
                  {isLocal
                    ? 'Runs locally — nothing you type leaves your machine.'
                    : 'Press Enter to send.'}
                </ComposerHint>
              </>
            )}
          </Control>
        </Container>
      </View>
      <ModelSelectionModal
        models={(chainData as any)?.models}
        isActive={openChangeModal}
        symbol={props.symbol}
        bidsLoading={bidsLoading}
        meta={meta}
        providersAvailability={providersAvailability}
        onChangeModel={(eventData) => {
          onCreateNewChat(eventData);
        }}
        handleClose={() => setOpenChangeModal(false)}
      />
    </>
  );
};

const renderMessage = (message, onOpenImage) => {
  if (message.isAudioContent) {
    return (
      <MessageBody>
        <AudioPlayer controls src={message.text} />
      </MessageBody>
    );
  }

  if (message.isImageContent) {
    return (
      <MessageBody>
        {
          <ImageContainer
            src={message.text}
            onClick={() => onOpenImage(message.text)}
          />
        }
      </MessageBody>
    );
  }

  if (message.isVideoRawContent) {
    return (
      <MessageBody>
        <VideoContainer>
          <video controls src={`${message.text}`} />
        </VideoContainer>
      </MessageBody>
    );
  }

  return (
    <MessageBody>
      <ThinkingMessageBody text={message.text} />
    </MessageBody>
  );
};

const Message = ({ message, onOpenImage }) => {
  // No name headers: the user's turns sit on the right in a brand-tinted
  // bubble, the model's on the left in glass with the orb. Side + material
  // identify the speaker.
  //
  // The design also carries a per-message Copy action (MsgActions/MsgActionBtn
  // in Chat.styles). It is deliberately NOT wired up here: this PR re-skins,
  // and a copy-to-clipboard affordance is new behaviour, not a new look — the
  // same reason Edit=Fork is excluded. The styled components stay available for
  // whichever PR adds the action.
  const isAssistant = message.role !== 'user';

  return (
    <MessageRow $user={!isAssistant}>
      {isAssistant && <MessageOrb aria-hidden>◈</MessageOrb>}
      <TurnColumn $user={!isAssistant}>
        <Bubble $user={!isAssistant}>
          {renderMessage(message, onOpenImage)}
        </Bubble>
      </TurnColumn>
    </MessageRow>
  );
};

// withChatState injects props that are loosely typed in its HOC signature;
// cast to suppress the HOC-vs-component prop mismatch.
export default withChatState(Chat as React.ComponentType<any>);
