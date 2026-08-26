import { useMemo } from 'react';
import styled from 'styled-components';
import { formatModelName } from '../utils';
import {
  IconMessage,
  IconMicrophone,
  IconHeadphones,
  IconVector,
  IconPhoto,
  IconEye,
  IconPlugConnectedX,
  IconChevronRight,
  IconHome,
  IconShieldLock,
  IconPin,
  IconPinFilled,
} from '@tabler/icons-react';
import { formatSmallNumber, SECURE_TAG, SECURE_BADGE_TOOLTIP } from '../utils';
import { modelPriceDisplay } from '../../../utils/marketplace';

type IconCmp = React.ComponentType<any>;

// Modality tags drive the leading icon + a single canonical badge.
// Any other tags get rendered as muted family/provider chips.
const MODALITY: Record<string, { label: string; Icon: IconCmp }> = {
  llm: { label: 'LLM', Icon: IconMessage },
  chat: { label: 'LLM', Icon: IconMessage },
  tts: { label: 'Text-to-Speech', Icon: IconHeadphones },
  stt: { label: 'Speech-to-Text', Icon: IconMicrophone },
  embeddings: { label: 'Embeddings', Icon: IconVector },
  embedding: { label: 'Embeddings', Icon: IconVector },
  image: { label: 'Image', Icon: IconPhoto },
  vision: { label: 'Vision', Icon: IconEye },
  multimodal: { label: 'Multimodal', Icon: IconEye },
};

const RowContainer = styled.button<{ $online: boolean }>`
  width: 100%;
  display: grid;
  grid-template-columns: 36px 1fr auto auto;
  gap: 1rem;
  align-items: center;
  padding: 1.2rem 1.4rem;
  margin: 0;
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.brandTint(0.22)};
  border-radius: 10px;
  color: ${(p) => p.theme.colors.textPrimary};
  cursor: ${(p) => (p.$online ? 'pointer' : 'not-allowed')};
  text-align: left;
  font: inherit;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.06s ease;
  opacity: ${(p) => (p.$online ? 1 : 0.55)};

  &:hover {
    /* Hover is a surface, not a status. Green is reserved for liveness (the
       StatusDot); tinting the row itself green made the whole panel read green. */
    background: ${(p) => p.theme.colors.brandTint(0.06)};
    border-color: ${(p) => p.theme.colors.brandTint(0.28)};
  }

  &:active:not(:disabled) {
    transform: scale(0.997);
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.brandTint(0.6)};
    outline-offset: 2px;
  }

  &:disabled {
    pointer-events: none;
  }
`;

const IconWrap = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: ${(p) => p.theme.colors.brandTint(0.12)};
  color: ${(p) => p.theme.colors.morMain};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const NameStack = styled.div`
  min-width: 0; /* allow truncation inside grid cell */
`;

const NameLine = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: ${(p) => p.theme.colors.morMain};
`;

const NameText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
`;

const StatusDot = styled.span<{ $online: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${(p) => (p.$online ? p.theme.colors.success : p.theme.colors.textMuted)};
  /* No successTint token exists (only brandTint/warningTint/dangerTint), and
     success is a fixed opaque string in both variants (hex in aurora, an
     rgba(...,1) string in classic) so it can't take an alpha suffix safely —
     leaving this literal glow as-is rather than risk invalid CSS under
     classic. Flagged for the theme owner: a successTint(a) fn would let this
     swap cleanly. */
  box-shadow: ${(p) =>
    p.$online ? `0 0 0 3px ${p.theme.colors.successTint(0.18)}` : 'none'};
`;

const MetaLine = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 3px;
  font-size: 1.1rem;
  color: ${(p) => p.theme.colors.textSecondary};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Pill = styled.span<{ $accent?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: ${(p) => p.theme.radii.sm};
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  background: ${(p) =>
    p.$accent ? p.theme.colors.brandTint(0.16) : p.theme.colors.brandTint(0.07)};
  color: ${(p) =>
    p.$accent ? p.theme.colors.morMain : p.theme.colors.textSecondary};
`;

/* Distinct accent for the TEE chip so the security attribute reads at a
   glance, even when the row is rendered outside the TEE section (e.g. when
   the user filters to a specific modality). */
const TeePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px 1px 5px;
  border-radius: ${(p) => p.theme.radii.sm};
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.3px;
  background: ${(p) => p.theme.colors.brandTint(0.14)};
  color: ${(p) => p.theme.colors.secondaryLight};
`;

const Dot = styled.span`
  color: ${(p) => p.theme.colors.textMuted};
  padding: 0 2px;
`;

const PriceBlock = styled.div`
  text-align: right;
  white-space: nowrap;
`;

const PriceValue = styled.div`
  font-variant-numeric: tabular-nums;
  font-size: 1.25rem;
  font-weight: 500;
  color: ${(p) => p.theme.colors.textPrimary};
`;

const PriceUnit = styled.div`
  font-size: 0.95rem;
  color: ${(p) => p.theme.colors.textSecondary};
  margin-top: 1px;
`;

/* The "available in my terminal" control — a PIN.
   A terminal glyph was tried first and read as decoration: at row scale it is a
   small square that says nothing about state, and a user scanning the list did
   not see it. A pin carries the meaning on its own (this one stays), and it has
   a filled form, so on/off is a shape difference rather than only an opacity
   difference — which is what makes it visible at a glance and legible to anyone
   who cannot rely on the colour. */
const TerminalPin = styled.span<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 0.4rem;
  border-radius: ${(p) => p.theme.radii.sm};
  cursor: pointer;
  color: ${(p) =>
    p.$on ? p.theme.colors.morMain : p.theme.colors.textSecondary};
  opacity: ${(p) => (p.$on ? 1 : 0.6)};
  background: ${(p) => (p.$on ? p.theme.colors.brandTint(0.14) : 'transparent')};
  transition:
    opacity 0.12s ease,
    background 0.12s ease;

  &:hover {
    opacity: 1;
    background: ${(p) => p.theme.colors.brandTint(0.18)};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.brandTint(0.6)};
    outline-offset: 2px;
  }
`;

const LocalBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 6px;
  border-radius: ${(p) => p.theme.radii.sm};
  background: ${(p) => p.theme.colors.brandTint(0.16)};
  color: ${(p) => p.theme.colors.morMain};
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.3px;
`;

const OfflineBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 6px;
  border-radius: ${(p) => p.theme.radii.sm};
  background: ${(p) => p.theme.colors.brandTint(0.06)};
  color: ${(p) => p.theme.colors.textMuted};
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.3px;
`;

const Caret = styled.div`
  color: ${(p) => p.theme.colors.textMuted};
  display: flex;
  align-items: center;
  justify-content: center;
  ${RowContainer}:hover & {
    color: ${(p) => p.theme.colors.morMain};
  }
`;

function classifyTags(rawTags: string[] = [], modelName: string = '') {
  const modalityKeys: string[] = [];
  const familyTags: string[] = [];
  const seenModality = new Set<string>();
  const normalisedName = modelName.toLowerCase();
  let hasTee = false;

  for (const tag of rawTags) {
    const lower = tag.toLowerCase().trim();
    if (!lower) continue;
    // TEE is a security attribute, not a family tag — surface separately.
    if (lower === SECURE_TAG) {
      hasTee = true;
      continue;
    }
    if (MODALITY[lower]) {
      if (!seenModality.has(MODALITY[lower].label)) {
        seenModality.add(MODALITY[lower].label);
        modalityKeys.push(lower);
      }
      continue;
    }
    // Skip tags that are just a prefix of the model name — they duplicate
    // information already shown (e.g. `qwen3-c` tag on `qwen3-coder-…`).
    if (normalisedName.includes(lower) || lower.includes(normalisedName)) {
      continue;
    }
    familyTags.push(tag);
  }

  return { modalityKeys, familyTags, hasTee };
}

function ModelRow(props: {
  model: any;
  symbol: string;
  // How to price the row: per-second rate (default) or the 6-minute stake it
  // takes to open a session. `meta` (marketplace supply/budget) is required to
  // compute the stake; the modal only offers that mode once meta has loaded.
  priceMode?: 'perSec' | 'stake6m';
  meta?: { supply?: string | number; budget?: string | number };
  onChangeModel: (data: { modelId: string; bidId?: string; isLocal?: boolean }) => void;
  /** Marketplace models only: is this one published to your terminal agents? */
  starred?: boolean;
  onToggleStar?: (modelId: string) => void;
}) {
  const model = props.model || {};
  const modelId = model.Id || '';
  const isLocal = !!model.isLocal;
  const isOnline = isLocal || model.isOnline !== false;
  const symbol = props.symbol || 'MOR';
  const lastCheck: Date | undefined = model.lastCheck
    ? new Date(model.lastCheck)
    : undefined;

  const { modalityKeys, familyTags, hasTee } = useMemo(
    () => classifyTags(model.Tags, model.Name),
    [model.Tags, model.Name],
  );

  const primaryModalityKey = modalityKeys[0] || 'llm';
  const ModalityIcon =
    MODALITY[primaryModalityKey]?.Icon || IconMessage;

  const priceMode = props.priceMode ?? 'perSec';
  const price = useMemo(
    () =>
      model?.isLocal
        ? ({ kind: 'local' } as const)
        : modelPriceDisplay(model?.bids, priceMode, props.meta),
    [model, priceMode, props.meta],
  );
  const providerCount = (model?.bids || []).filter((b: any) => b?.Id).length;

  const handleSelect = () => {
    if (!isOnline) return;
    if (isLocal) {
      props.onChangeModel({ modelId, isLocal: true });
    } else {
      props.onChangeModel({ modelId });
    }
  };

  // Title tooltip surfaces the full model name + all original tags for
  // discoverability when the row is truncated.
  const tooltip = `${model.Name}${
    model.Tags?.length ? ' — ' + model.Tags.join(', ') : ''
  }`;

  return (
    <RowContainer
      type="button"
      data-testid="model-row"
      // Lets a check scope to ONE row. Without it a locator that matched "the
      // element containing this model's name" also matched every ancestor, and
      // therefore every other row's controls too.
      data-model-local={isLocal ? 'true' : 'false'}
      $online={isOnline}
      disabled={!isOnline}
      onClick={handleSelect}
      title={tooltip}
    >
      <IconWrap>
        <ModalityIcon size={20} stroke={1.8} />
      </IconWrap>

      <NameStack>
        <NameLine>
          <StatusDot $online={isOnline} />
          <NameText>{formatModelName(model.Name)}</NameText>
        </NameLine>
        <MetaLine>
          {modalityKeys.slice(0, 1).map((key) => (
            <Pill key={key} $accent>
              {MODALITY[key].label}
            </Pill>
          ))}
          {hasTee && (
            <TeePill title={SECURE_BADGE_TOOLTIP}>
              <IconShieldLock size={11} stroke={2.2} />
              Secure
            </TeePill>
          )}
          {!isLocal && providerCount > 1 && (
            <>
              <Dot>·</Dot>
              <span>{providerCount} providers</span>
            </>
          )}
          {familyTags.slice(0, 2).map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
          {!isOnline && lastCheck && (
            <>
              <Dot>·</Dot>
              <span>
                <IconPlugConnectedX
                  size={12}
                  style={{ verticalAlign: '-2px', marginRight: 3 }}
                />
                Offline since {lastCheck.toLocaleTimeString()}
              </span>
            </>
          )}
        </MetaLine>
      </NameStack>

      <PriceBlock>
        {price.kind === 'local' && (
          <LocalBadge>
            <IconHome size={13} stroke={2} />
            Local
          </LocalBadge>
        )}
        {/* Marketplace only. A local model is already served and is deliberately
            withheld from grok — it refuses tools+stream, which a coding agent
            always sends — so a star there would promise what cannot happen. */}
        {!isLocal && props.onToggleStar && (
          <TerminalPin
            data-testid="pin-model"
            role="button"
            tabIndex={0}
            aria-label={
              props.starred
                ? 'Unpin from your terminal'
                : 'Pin to your terminal'
            }
            title={
              props.starred
                ? 'Pinned — listed in grok and opencode. Click to unpin.'
                : 'Pin to grok and opencode, so you can pick it there without opening a session first.'
            }
            $on={!!props.starred}
            onClick={(e: React.MouseEvent) => {
              // Starring is not choosing: without this the click also selects
              // the model and closes the dialog.
              e.stopPropagation();
              props.onToggleStar?.(modelId);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                props.onToggleStar?.(modelId);
              }
            }}
          >
            {props.starred ? (
              <IconPinFilled size={17} />
            ) : (
              <IconPin size={17} stroke={2} />
            )}
          </TerminalPin>
        )}
        {price.kind === 'offline' && <OfflineBadge>Unavailable</OfflineBadge>}
        {price.kind === 'single' && (
          <>
            <PriceValue>{formatSmallNumber(price.value)}</PriceValue>
            <PriceUnit>
              {priceMode === 'stake6m' ? `${symbol} to open` : `${symbol}/s`}
            </PriceUnit>
          </>
        )}
        {price.kind === 'range' && (
          <>
            <PriceValue>
              {formatSmallNumber(price.min)} – {formatSmallNumber(price.max)}
            </PriceValue>
            <PriceUnit>
              {priceMode === 'stake6m' ? `${symbol} to open` : `${symbol}/s`}
            </PriceUnit>
          </>
        )}
      </PriceBlock>

      <Caret>
        <IconChevronRight size={18} stroke={2} />
      </Caret>
    </RowContainer>
  );
}

export default ModelRow;
