import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// import component 👇
import Drawer from 'react-modern-drawer';
import {
  IconHistory,
  IconArrowUp,
  IconMessagePlus,
  IconShieldLock,
  IconUpload,
  IconMicrophone,
  IconPlayerStopFilled,
  IconBulb,
  IconCheck,
  IconCode,
  IconCopy,
  IconPencil,
  IconListSearch,
} from '@tabler/icons-react';
import {
  View,
  MessageBody,
  MessageRow,
  TurnColumn,
  Bubble,
  MsgActions,
  MsgActionBtn,
  SendRoundBtn,
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
  ChatIntroButton,
  SendBtnWrapper,
  Btn,
  AudioInputZone,
  AudioActionBtn,
  AudioHint,
  TtsControlsRow,
  AudioPlayer,
  ChatHeader,
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
} from './Chat.styles';
import withChatState from '../../store/hocs/withChatState';
import { abbreviateAddress } from '../../utils';
import { ThinkingMessageBody } from './ThinkingMessageBody';

import 'react-modern-drawer/dist/index.css';
import './Chat.css';
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
} from './utils';
import { Cooldown } from './Cooldown';
import ImageViewer from 'react-simple-image-viewer';
import { ChatData, HistoryMessage } from './interfaces';
import { formatMor } from '../../utils/coinValue';
import { ApiGateway } from 'src/main/src/client/apiGateway';
import { queryKeys, buildModelsWithBids } from '../../store/queries';

let abort = false;
let cancelScroll = false;
const userMessage = { user: 'Me', role: 'user', icon: 'M', color: '#6fd6ff' };

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

// Starter prompts for an empty chat. Deliberately generic (they must make sense
// for any model on the network, local or remote) and phrased as things a person
// actually wants, not as feature demos.
const STARTER_PROMPTS = [
  {
    icon: IconBulb,
    label: 'Explain a hard idea in plain language',
    prompt: 'Explain how large language models work, in plain language.',
  },
  {
    icon: IconCode,
    label: 'Write and explain some code',
    prompt:
      'Write a Python function that deduplicates a list while preserving order, and explain how it works.',
  },
  {
    icon: IconPencil,
    label: 'Draft something for me',
    prompt: 'Draft a short, friendly email asking a colleague to review my pull request.',
  },
  {
    icon: IconListSearch,
    label: 'Think a decision through',
    prompt:
      'Help me think through a decision: list the strongest arguments on each side, then tell me what you would choose and why.',
  },
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
  getLocalModels: () => Promise<any[]>;
  getSessionsByUser: (address: string) => Promise<any>;
  getProvidersAvailability: (providers: any[]) => Promise<any[]>;
  getBidInfo: (id: string) => Promise<any>;
  getBidsByModelId: (id: string) => Promise<any>;
  getAllActiveBidsByModel: (providers: any[]) => Promise<Map<string, any[]>>;
  onOpenSession: (props: {
    modelId: string;
    duration: number;
    isDirectPay: boolean;
  }) => Promise<any>;
  closeSession: (sessionId: string) => Promise<any>;
};

const Chat = (props: ChatProps) => {
  const chatBlockRef = useRef<null | HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  // Set by the local-first fast path below; distinct from initializedRef so
  // the full init effect still runs (to restore an open network session) once
  // the heavy queries land.
  const localInitRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const [promptInput, setPromptInput] = useState('');
  // Index of the user message being edited (null = normal composing). Editing
  // REWRITES the conversation from that turn: see the fork logic in call().
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
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

  const navigate = useNavigate();

  // Send the user to the wallet's Receive view (address + QR) — the actual way
  // to get MOR into this wallet, rather than a disabled button.
  const goToReceiveMor = () => navigate('/wallet', { state: { openModal: 'receive' } });

  // The local model costs nothing and needs no session, so it is always a real
  // option when the network ones are out of reach.
  const switchToLocalModel = () => {
    const localModel = chainData?.models?.find((m: any) => m.isLocal);
    if (!localModel) return;
    setSelectedModel(localModel);
    setChat({
      id: generateHashId(),
      createdAt: new Date(),
      modelId: localModel.Id,
      isLocal: true,
    });
    setMessages([]);
  };

  // Clicking a starter prompt fills the composer rather than sending straight
  // away — the user stays in control of what actually gets asked, and can edit
  // it first.
  const usePrompt = (prompt: string) => {
    setPromptInput(prompt);
    composerRef.current?.focus();
  };

  // --- Cached data layer (stale-while-revalidate via react-query) ---------
  // These queries live in the app-level QueryClient, so navigating away from
  // and back to /chat serves cached data instantly and revalidates silently
  // instead of blocking behind a full-screen spinner.

  const modelsDataQuery = useQuery({
    queryKey: queryKeys.modelsData,
    queryFn: () => props.getModelsData(),
  });

  // Local models only — a milliseconds-fast router call with no chain reads.
  // This is what lets the built-in model be usable immediately instead of
  // waiting behind the full models/providers/balances composite above.
  const localModelsQuery = useQuery({
    queryKey: queryKeys.localModels,
    queryFn: async () =>
      ((await props.getLocalModels()) || []).map((m: any) => ({
        ...m,
        isLocal: true,
      })),
  });

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions(props.address),
    queryFn: () => props.getSessionsByUser(props.address),
    enabled: !!props.address,
  });

  const chatTitlesQuery = useQuery({
    queryKey: queryKeys.chatTitles,
    queryFn: () => props.client.getChatHistoryTitles(),
  });

  // Bid fan-out for every marketplace model. Runs in the background after the
  // base model list is available; does NOT gate the initial render. Mirrors the
  // previous "effect #2" merge logic but cached across visits.
  const modelsWithBidsQuery = useQuery({
    queryKey: queryKeys.modelsWithBids,
    enabled: !!modelsDataQuery.data,
    // Shared with the Router's DataPrefetcher, which warms this exact key at app
    // start — so by the time the picker is opened the list is already there.
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
  const bidsLoading = modelsWithBidsQuery.isFetching;

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

  // Initial-load overlay: only until SOME init path completes — the local
  // fast path (milliseconds) or the full chain-data path. The old gate also
  // waited on modelsData + sessions, which made the built-in model — a local
  // call that answers in ~1s — sit behind seconds of chain reads.
  const isLoading = isActionLoading || !initialized;

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

  // WHO is actually serving this chat. The router — not the app — picks the
  // provider from the model's bids, so the only way to know is to read it off
  // the bid the session was opened against. The bid already carries the
  // provider's on-chain record (ProviderData, attached in the modelsWithBids
  // query), so the endpoint is in hand; a truncated hex address told the user
  // nothing about who they are talking to.
  const providerEndpoint = selectedBid?.ProviderData?.Endpoint as
    | string
    | undefined;

  // Endpoints are host:port (e.g. "router.example.com:3333"). Show the host —
  // that is the identity — and drop the scheme/port noise.
  const providerHost = providerEndpoint
    ? providerEndpoint.replace(/^https?:\/\//, '').split(':')[0]
    : undefined;

  const providerLabel = isLocal
    ? '(local)'
    : providerHost ||
      (selectedBid?.Provider ? abbreviateAddress(selectedBid.Provider, 6) : 'Unknown');

  // Full detail on hover — the address is what identifies the provider on-chain,
  // even though the host is what identifies it to a human.
  const providerTitle = isLocal
    ? undefined
    : [
        selectedBid?.Provider && `Provider ${selectedBid.Provider}`,
        providerEndpoint && `Endpoint ${providerEndpoint}`,
      ]
        .filter(Boolean)
        .join('\n') || undefined;
  const isDisabled = (!activeSession && !isLocal) || isReadonly;
  // The MOR actually LOCKED in the session — read it off the session, which
  // carries it. This used to compute (EndsAt - OpenedAt) * PricePerSecond, which
  // is the session's COST (the stipend), not the stake: for a real 359s session
  // at 0.0000072544 MOR/s that is ~0.0026 MOR, so a genuine 0.8385 MOR stake
  // rendered as "0.00 MOR staked". Stake and cost differ by the
  // supply/budget multiplier (~321x today) — they are not interchangeable.
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

    // The local fast path may already have the user chatting with the
    // built-in model. If they've engaged (typed or sent anything), keep their
    // chat — restoring an open session out from under them is a rug-pull.
    if (localInitRef.current && (messages.length > 0 || promptInput)) {
      return;
    }

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
    const openSessions = mappedSessions.filter((s) => !isClosed(s));

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
      modelId: latestSessionModel.ModelAgentId,
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
  }, [modelsDataQuery.data, sessionsQuery.data]);

  // LOCAL-FIRST FAST PATH: the built-in model needs no chain data, so don't
  // make it wait for the models/providers/balances composite (seconds of
  // chain reads) or the paginated sessions fetch. As soon as the local model
  // list is known (a milliseconds-fast router call), open a local chat and
  // drop the full-screen spinner. The full effect above still runs when the
  // heavy data lands and upgrades to an open network session — unless the
  // user has already started using this chat.
  useLayoutEffect(() => {
    if (initializedRef.current || localInitRef.current) {
      return;
    }
    if (modelsDataQuery.data && sessionsQuery.data) {
      return; // warm cache — the full init effect above already handled it
    }
    const locals = localModelsQuery.data;
    if (!locals?.length) {
      return;
    }
    localInitRef.current = true;
    setSelectedModel(locals[0]);
    setChat({
      id: generateHashId(),
      createdAt: new Date(),
      modelId: locals[0].Id,
      isLocal: true,
    });
    setMessages([]);
    setInitialized(true);
  }, [localModelsQuery.data, modelsDataQuery.data, sessionsQuery.data]);

  // Keep the chat-history drawer list in sync with the cached titles + models.
  useEffect(() => {
    const titles = chatTitlesQuery.data as
      | Array<{
          chatId: string;
          title: string;
          modelId: string;
          createdAt: number;
          isLocal: boolean;
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

  // The contract's hard floor (SessionStorage.MIN_SESSION_DURATION).
  const MIN_SESSION_SECONDS = 5 * 60;

  // ...but NEVER request exactly the floor. The user asks for a DURATION; the
  // router turns it into a stake with an integer division that truncates DOWN
  // (computeSessionTokenAmount), and the contract then derives the duration back
  // out of that stake through two more truncating divisions
  // (stakeToStipend / pricePerSecond). The round-trip can only LOSE time, so a
  // request of exactly 300s comes back as 299s and reverts with
  // SessionTooShort(). Reproduced against live chain values:
  //   request 300s -> stake 5.7794 MOR -> contract derives 299s  REVERT
  //   request 360s -> stake 6.9353 MOR -> contract derives 359s  OK
  // One minute of cushion absorbs the truncation with room to spare.
  const MIN_REQUEST_SECONDS = MIN_SESSION_SECONDS + 60;

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

    // Both branches used to be able to land on EXACTLY MIN_SESSION_SECONDS —
    // the guaranteed-revert value. Floor everything at MIN_REQUEST_SECONDS.
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
    const allSessions = await refreshSessions();
    const targetSessionData = allSessions.find((x) => x.Id == sessionId);
    setActiveSession({ ...targetSessionData, sessionId });
    const targetModel = chainData.models.find(
      (x) => x.Id == targetSessionData.ModelAgentId,
    );
    const targetBid = targetModel.bids.find(
      (x) => x.Id == targetSessionData.BidID,
    );
    setSelectedBid(targetBid);
  };

  const onOpenSession = async (isReopen: boolean, isDirectPay: boolean) => {
    // On REOPEN the user came from a restored chat, where selectedModel may not
    // be set — this read `selectedModel.bids` unconditionally and threw
    // "Cannot read properties of undefined (reading 'bids')" straight out of the
    // Staking button. Resolve the model from the chat as a fallback, and refuse
    // with a message rather than an uncaught TypeError.
    const model =
      selectedModel ??
      chainData?.models?.find((m: any) => m.Id === chat?.modelId);

    if (!model?.bids?.length) {
      props.toasts.toast(
        'error',
        model
          ? 'No providers are offering this model right now.'
          : 'Could not work out which model this chat uses — pick it again.',
      );
      return;
    }

    setIsActionLoading(true);

    if (!isReopen) {
      setChat({
        id: generateHashId(),
        createdAt: new Date(),
        modelId: model.Id,
      });
    }

    const prices = model.bids.map((x: any) => Number(x.PricePerSecond));
    const maxPrice = Math.max(...prices);
    const duration = isDirectPay
      ? calculateAcceptableDurationForDirectPay(meta)
      : calculateAcceptableDuration(maxPrice, Number(balances.mor), meta);

    try {
      const openedSession = await props.onOpenSession({
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

  const loadChatHistory = async (chatId: string) => {
    try {
      const history = await props.client.getChatHistory(chatId);
      const messages: HistoryMessage[] = [];
      if (!history) {
        return;
      }

      const model = chainData.models.find((m) => m.Id == history.modelId);

      // Restoring a chat has to restore the MODEL too, not just its name. This
      // used to look the model up only to render the title/icon and then throw it
      // away, leaving selectedModel undefined — so reopening an expired session
      // (Staking / Direct Pay) crashed on `selectedModel.bids`.
      if (model) {
        setSelectedModel(model);
      }

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

        let userText: string;
        if (isChatPrompt) {
          userText = prompt.messages[0]?.content ?? '';
        } else if (isTtsPrompt) {
          userText = prompt.input;
        } else if (isSttMessage) {
          // The uploaded/recorded audio is not retained in a replayable form.
          userText = prompt.Prompt || prompt.prompt || '🎤 Audio input';
        } else {
          userText = '';
        }

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
    const fresh = await queryClient.fetchQuery({
      queryKey: queryKeys.sessions(props.address),
      queryFn: () => props.getSessionsByUser(props.address),
    });
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
    setIsActionLoading(true);
    await props.closeSession(sessionId);
    await refreshSessions();
    setIsActionLoading(false);

    if (activeSession.Id == sessionId) {
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
    // search open session by model ID
    const openSession = openSessions.find((s) => s.ModelAgentId == modelId);
    setIsReadonly(!openSession);

    if (openSession) {
      setActiveSession(openSession);
      const activeBid = selectedModel.bids.find(
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
    // Only leave read-only if a session actually opened. This used to clear it
    // unconditionally, so a FAILED reopen handed the user a writable composer
    // with no session behind it — and the next prompt died at the router.
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
    // EDIT = FORK. The router prepends its stored history for a chat_id to
    // every prompt, so re-sending an edited turn under the same id would
    // replay the superseded turns as context. Instead: truncate the local
    // transcript at the edited turn, mint a fresh chat_id, and hand the
    // truncated context to the router in the payload (it stores the full
    // prompt, so later turns on the fork keep this context). The original
    // thread survives untouched in the history drawer.
    const isEdit = editingIndex !== null;
    const baseMessages = isEdit ? messages.slice(0, editingIndex) : messages;
    let activeChat = chat;
    if (isEdit) {
      activeChat = {
        id: generateHashId(),
        createdAt: new Date(),
        modelId: selectedModel?.Id,
        isLocal,
      };
      setChat(activeChat);
      setEditingIndex(null);
    }

    let memoState = [
      ...baseMessages,
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
    headers['chat_id'] = activeChat?.id;

    const incommingMessage = { role: 'user', content: message };
    // Only an edit-fork carries history in the payload — normal turns rely on
    // the router's stored context, same as before.
    // THE CONVERSATION. This used to be sent ONLY when editing (a fork) — every
    // normal turn shipped a single message and nothing else, so the model had no
    // memory of anything you had just said.
    //
    // The app was relying on the proxy-router to prepend its stored history for
    // the chat_id. The router does store it (the JSON files are on disk and
    // complete) and does try to load it — but it drops every message on the way
    // back in:
    //
    //   ChatMessage.Prompt is `interface{}`, so after json.Unmarshal it is a
    //   map[string]interface{} — and AppendChatHistory does
    //     if chatReq, ok := chat.Prompt.(OpenAiCompletionRequest); ok { ... }
    //   (chatstorage/genericchatstorage/interface.go:32). That assertion can
    //   NEVER succeed after a JSON round-trip. `ok` is discarded, so it fails
    //   silently and the router prepends an EMPTY history.
    //
    // That is an upstream proxy-router bug — chat memory has never worked for
    // anyone. The client is the right place to own the context anyway (it is what
    // every other OpenAI-compatible client does), so send the transcript
    // ourselves rather than depend on the router reconstructing it.
    //
    // `baseMessages` is already truncated at the edited turn when isEdit, so the
    // fork semantics are unchanged — an edit still forks, it just no longer
    // needs a special case to carry its context.
    const context = baseMessages
      .filter(
        (m: any) =>
          !m.isAudioContent && !m.isImageContent && !m.isVideoRawContent,
      )
      .map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

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
      // The router forwards the provider's own failure as
      //   { providerModelError: { error: { message, type } } }
      // e.g. {"message":"404 page not found","type":"upstream_error"} when a
      // provider still has a live bid on-chain but its model endpoint is gone.
      // This used to be console.log'd into the void behind a generic toast,
      // which left the user with a dead model and no way to know why — the
      // failure is not theirs to fix, it is the provider's, and the only useful
      // action (pick a different model) was never suggested.
      const detail = await response.json().catch(() => null);
      const providerError = detail?.providerModelError?.error;
      const reason =
        providerError?.message ??
        detail?.error?.message ??
        `HTTP ${response.status}`;

      console.error('[chat] prompt rejected', {
        status: response.status,
        model: selectedModel?.Name,
        sessionId: activeSession?.Id,
        providerError: providerError ?? detail,
      });

      props.toasts.toast(
        'error',
        providerError
          ? `This model's provider isn't responding (${reason}). Try another model.`
          : `Failed to send prompt: ${reason}`,
      );
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
      setChatsData([...chatData, { ...chat, title: file.name || 'Transcription' }]);
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
      setChatsData([...chatData, title]);
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

  // The stake depends on two async inputs: the model's bids AND the marketplace
  // meta (supply/budget). It used to be computed ONCE, at model-selection time —
  // so whenever meta had not landed yet it was computed against the
  // {supply: 0, budget: 0} default, yielded 0/NaN, and never recovered. That is
  // what rendered "a session needs at least 0.00 MOR". Recompute whenever either
  // input changes, so the figure appears as soon as it is actually knowable.
  useEffect(() => {
    const bids = selectedModel?.bids;
    if (!bids?.length || !Number(meta.supply) || !Number(meta.budget)) return;

    const maxPrice = Math.max(...bids.map((x) => Number(x.PricePerSecond)));
    if (!Number.isFinite(maxPrice) || maxPrice <= 0) return;

    setRequiredStake({
      min: calculateStake(maxPrice, MIN_REQUEST_SECONDS / 60),
      max: calculateStake(maxPrice, 24 * 60),
    });
  }, [selectedModel, meta.supply, meta.budget]);

  const onCreateNewChat = ({ modelId, isLocal }) => {
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

    const openSessions = sessions.filter((s) => !isClosed(s));
    const openModelSession = openSessions.find(
      (s) => s.ModelAgentId == modelId,
    );

    if (openModelSession) {
      const selectedBid = selectedModel.bids.find(
        (b) => b.Id == openModelSession.BidID && b.bids,
      );
      setSelectedBid(selectedBid);
      setActiveSession(openModelSession);
      return;
    }

    const prices = selectedModel.bids.map((x) => Number(x.PricePerSecond));
    const maxPrice = Math.max(...prices);

    setRequiredStake({
      min: calculateStake(maxPrice, MIN_REQUEST_SECONDS / 60),
      max: calculateStake(maxPrice, 24 * 60),
    });
  };

  const wrapChangeTitle = async (data: { id; title }) => {
    await props.client.updateChatHistoryTitle(data);
  };

  const renderChatBlock = () => {
    const isNewChat = !messages?.length;
    const isCreateSessionMode =
      isNewChat && !isLocal && !activeSession && !isLoading;

    // Stake mode. requiredStake.min is 0 until the model's bids AND the
    // marketplace meta have loaded — and `balance > 0` is trivially true against
    // an unknown (0) requirement, so the app declared an unaffordable model
    // affordable and enabled a Stake button that could only fail. An unknown
    // price is NOT an affordable price: treat it as not-yet-payable.
    const stakeKnown = Number(requiredStake.min) > 0;
    const isEnoughFunds =
      stakeKnown && Number(balances.mor) >= Number(requiredStake.min);

    // Direct pay spends MOR outright: the floor is the shortest session the
    // contract allows (MIN_SESSION_DURATION = 5 minutes) at the model's price.
    //
    // The old expression was `(5 * 3600 * meta.supply) / meta.budget` — marked
    // "TODO: fixme", and rightly. It contains NO price at all, and evaluates to
    // a unitless ~5.8e6 while `balances.mor` is in WEI. So the comparison was
    // trivially true for any non-dust balance: the app believed you could Direct
    // Pay with 0.000005 MOR, which made `cannotPayAtAll` false and REPLACED the
    // helpful "You'll need some MOR" screen with a payment screen whose Stake
    // button is disabled and whose Direct Pay leads nowhere — a dead end that
    // reads as "the app won't let me pick a model".
    const dearestBid = Math.max(
      0,
      ...((selectedModel?.bids ?? []).map((x) => Number(x.PricePerSecond)) as number[]),
    );
    const requiredStakeForDirectPay = dearestBid * MIN_REQUEST_SECONDS;
    const isEnoughFundsForDirectPay =
      requiredStakeForDirectPay > 0 &&
      Number(balances.mor) >= requiredStakeForDirectPay;

    // Neither payment route is affordable. Offering two greyed-out buttons and
    // no way to fix that is a dead end: it tells the user what they can't do
    // and nothing about what they can. Show them how to get MOR instead — and
    // point out the local model, which costs nothing and works right now.
    const cannotPayAtAll = !isEnoughFunds && !isEnoughFundsForDirectPay;

    // requiredStake stays 0 until a model with bids is selected AND the
    // marketplace meta has loaded — `meta` defaults to {supply: 0, budget: 0},
    // so calculateStake divides by zero and yields 0/NaN. Formatting that with
    // toFixed(2) is what produced "a session needs at least 0.00 MOR".
    // Never state a figure we don't have; say nothing about the amount instead.
    const minStakeLabel =
      requiredStake.min > 0 ? formatMor(requiredStake.min, 18) : null;
    const maxStakeLabel =
      requiredStake.max > 0 ? formatMor(requiredStake.max, 18) : null;
    const balanceLabel = formatMor(balances.mor, 18) ?? '0';

    return (
      <>
        {isCreateSessionMode && cannotPayAtAll ? (
          <ChatIntroContainer>
            <ChatIntroInner>
              <ChatIntroInnerTitle>You&apos;ll need some MOR</ChatIntroInnerTitle>
              <ChatIntroInnerText>
                This model runs on the Morpheus network, where you stake MOR for
                the length of a session.{' '}
                {minStakeLabel
                  ? `The shortest session — 6 minutes — stakes about ${minStakeLabel} MOR.`
                  : 'Working out what a session costs…'}{' '}
                You have {balanceLabel} MOR.
              </ChatIntroInnerText>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ChatIntroButton onClick={goToReceiveMor}>
                  Receive MOR
                </ChatIntroButton>
              </div>
              <ChatIntroInnerText>
                No rush — you can keep chatting with the local model for free.
                It runs on your own machine, so it costs nothing and works
                offline.
              </ChatIntroInnerText>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ChatIntroButton onClick={switchToLocalModel}>
                  Use the free local model
                </ChatIntroButton>
              </div>
            </ChatIntroInner>
          </ChatIntroContainer>
        ) : isCreateSessionMode ? (
          <ChatIntroContainer>
            <ChatIntroInner>
              <ChatIntroInnerTitle>Select payment method</ChatIntroInnerTitle>
              <ChatIntroInnerText>
                Stake MOR to pay for compute. A session runs from 6 minutes up
                to 24 hours depending on how much you stake
                {minStakeLabel && maxStakeLabel
                  ? ` (${minStakeLabel} MOR for 6 minutes, ${maxStakeLabel} MOR for the full 24 hours)`
                  : ''}
                . You can claim your stake back after 24h.
              </ChatIntroInnerText>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ChatIntroButton
                  onClick={() => onOpenSession(false, false)}
                  disabled={!isEnoughFunds}
                >
                  Stake MOR
                </ChatIntroButton>
              </div>
              <ChatIntroInnerText>
                Pay with your MOR tokens directly. The duration of the session
                is limited only with your MOR balance.
              </ChatIntroInnerText>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ChatIntroButton
                  onClick={() => onOpenSession(false, true)}
                  disabled={!isEnoughFundsForDirectPay}
                >
                  Direct Pay
                </ChatIntroButton>
              </div>
            </ChatIntroInner>
          </ChatIntroContainer>
        ) : isNewChat && !isLoading ? (
          // The old screen rendered an empty container here — roughly 60% of the
          // view was undesigned void, which reads as "failed to load" rather
          // than as minimalism. An empty chat is the best chance to teach the
          // app, so it says what this model is, what it costs, and gives the
          // user something to click.
          <EmptyState>
            <EmptyTitle>Ask {formatModelName(modelName)} anything</EmptyTitle>
            <EmptySubtitle>
              {isLocal
                ? 'This model runs entirely on your machine. Nothing leaves your computer, it costs nothing, and it works offline.'
                : 'You have an open session with this provider. Ask away — you pay only for the time the session is open.'}
            </EmptySubtitle>
            <PromptGrid>
              {STARTER_PROMPTS.map(({ icon: Icon, label, prompt }) => (
                <PromptCard
                  key={label}
                  onClick={() => usePrompt(prompt)}
                  type="button"
                >
                  <Icon size={18} stroke={1.75} />
                  <span>{label}</span>
                </PromptCard>
              ))}
            </PromptGrid>
          </EmptyState>
        ) : (
          <ChatHistoryContainer ref={chatBlockRef}>
            {messages?.map((x, index) => (
              <Message
                key={index}
                message={x}
                onOpenImage={setImagePreview}
                // The orb on the answer currently streaming sweeps, so the
                // thinking state lives on the turn it belongs to.
                isThinking={isSpinning && index === messages.length - 1}
                onCopy={(text: string) => {
                  // Feedback is the button's own "Copied" state — no toast.
                  window.copyToClipboard(text);
                }}
                onEdit={(text: string) => {
                  setEditingIndex(index);
                  setPromptInput(text);
                  composerRef.current?.focus();
                }}
              />
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
            style={{ width: '5rem', height: '5rem', color: '#6fd6ff' }}
            animation="border"
          />
        </LoadingCover>
      )}
      <Drawer
        open={isOpen}
        onClose={toggleDrawer}
        direction="right"
        className="history-drawer"
      >
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
      </Drawer>
      <View>
        {/* One header, not two stacked toolbars. The model is identified
            calmly (name as a label, not a 900-weight green shout), its cost is
            stated in words a person can act on, and the utility actions sit
            quietly on the right — the loud green now belongs to Send alone. */}
        <ChatHeader>
          <ChatIdentity>
            {/* The JARVIS orb, at rest — see ModelGlyph in Chat.styles. */}
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
                    <span title={providerTitle}>{providerLabel}</span> ·{' '}
                    {stakedFunds} MOR staked
                    {activeSession?.EndsAt && (
                      <>
                        {' · '}
                        <Cooldown endDate={activeSession?.EndsAt} />
                      </>
                    )}
                  </>
                )}
              </ModelSubline>
            </ModelMeta>
          </ChatIdentity>

          <HeaderActions>
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
          {renderChatBlock()}
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
                {isSpinning && <Spinner animation="border" size="sm" style={{ color: '#6fd6ff' }} />}
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
                    dominant surface — an elevated card that owns the brand
                    focus ring. It used to be a hairline box while "New chat"
                    carried the loudest fill on screen. */}
                <Composer $focused={composerFocused}>
                <CustomTextArrea
                  ref={composerRef}
                  disabled={isDisabled}
                  onFocus={() => setComposerFocused(true)}
                  onBlur={() => setComposerFocused(false)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  onKeyDown={(e) => {
                    // Escape backs out of an edit without sending.
                    if (e.key === 'Escape' && editingIndex !== null) {
                      setEditingIndex(null);
                      setPromptInput('');
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
                          <Spinner animation="border" style={{ color: '#6fd6ff' }} />
                        ) : (
                          <span>Staking</span>
                        )}
                      </Btn>
                      <Btn onClick={() => handleReopen(true)}>
                        {isSpinning ? (
                          <Spinner animation="border" style={{ color: '#6fd6ff' }} />
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
                          style={{
                            color: '#6fd6ff',
                            width: '20px',
                            height: '20px',
                          }}
                        />
                      ) : (
                        <IconArrowUp size={'22px'}></IconArrowUp>
                      )}
                    </SendRoundBtn>
                  )}
                </SendBtnWrapper>
                </Composer>
                <ComposerHint>
                  {editingIndex !== null
                    ? 'Editing a message — Enter rewrites the conversation from that point · Esc cancels'
                    : isLocal
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

const Message = ({
  message,
  onOpenImage,
  isThinking = false,
  onCopy,
  onEdit,
}) => {
  // No name headers: the user's turns sit on the right in a brand-tinted
  // bubble, the model's on the left in glass with the orb. Side + material
  // identify the speaker. Copy is available on any text turn; Edit only on
  // the user's own prompts (it refills the composer).
  const isAssistant = message.role !== 'user';
  // Copy feedback lives in the button itself: check + "Copied", then revert.
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    onCopy?.(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const isPlainText =
    !message.isAudioContent &&
    !message.isImageContent &&
    !message.isVideoRawContent;

  return (
    <MessageRow $user={!isAssistant}>
      {isAssistant && (
        <MessageOrb aria-hidden $thinking={isThinking}>
          ◈
        </MessageOrb>
      )}
      <TurnColumn $user={!isAssistant}>
        <Bubble $user={!isAssistant}>
          {renderMessage(message, onOpenImage)}
        </Bubble>
        {isPlainText && (
          <MsgActions className="msg-actions" $user={!isAssistant}>
            {!isAssistant && (
              <MsgActionBtn
                type="button"
                onClick={() => onEdit?.(message.text)}
              >
                <IconPencil size={12} /> Edit
              </MsgActionBtn>
            )}
            <MsgActionBtn type="button" onClick={handleCopy}>
              {copied ? (
                <>
                  <IconCheck size={12} /> Copied
                </>
              ) : (
                <>
                  <IconCopy size={12} /> Copy
                </>
              )}
            </MsgActionBtn>
          </MsgActions>
        )}
      </TurnColumn>
    </MessageRow>
  );
};

// withChatState injects props that are loosely typed in its HOC signature;
// cast to suppress the HOC-vs-component prop mismatch.
export default withChatState(Chat as React.ComponentType<any>);
