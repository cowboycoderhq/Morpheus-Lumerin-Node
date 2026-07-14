import { useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import {
  IconSearch,
  IconMessage,
  IconMicrophone,
  IconHeadphones,
  IconVector,
  IconHome,
  IconWorld,
  IconShieldLock,
  IconInfoCircle,
  IconUsers,
  IconCoin,
  IconSparkles,
} from '@tabler/icons-react';
import Modal from '../../contracts/modals/Modal';
import ModelRow from './ModelRow';
import { isSecureModel, SECURE_MODE_INFO } from '../utils';

/* The shared outer modal `Body` (in CreateContractModal.styles) bakes in
   `padding: 5rem` and never sets `overflow: hidden`, so an `auto`-height box
   with `max-height: 78vh` still lets children visually spill past its
   bottom edge.
   We override via inline `style` (beats the styled-component CSS) to:
     - give the box a definite height so child `height: 100%` resolves,
     - clip overflow so the inner scroll region is the real scroll boundary,
     - zero out the 5rem padding so we control spacing inside the Layout. */
const bodyProps = {
  width: '640px',
  maxWidth: '90%',
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  style: {
    height: 'min(78vh, 760px)',
    maxHeight: '78vh',
    padding: 0,
    overflow: 'hidden',
  },
};

const Layout = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

/* Right padding leaves room for the absolute-positioned close X
   (32px button at top: 12px / right: 12px → clears ~52px from the right). */
const Header = styled.div`
  padding: 1.8rem 5.5rem 1.4rem 2.4rem;
  border-bottom: 1px solid rgba(94, 208, 255, 0.22);
`;

const TitleRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.4rem;
  margin-bottom: 1.4rem;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.9rem;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: ${(p) => p.theme.colors.morMain};
`;

const ResultCount = styled.div`
  font-size: 1.15rem;
  color: rgba(255, 255, 255, 0.45);
  font-variant-numeric: tabular-nums;
`;

const SearchWrapper = styled.div`
  .input-group {
    background: rgba(94, 208, 255, 0.04);
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(94, 208, 255, 0.22);
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .input-group:focus-within {
    border-color: ${(p) => p.theme.colors.morMain};
    background: rgba(94, 208, 255, 0.06);
  }

  .input-group-text {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    padding-right: 0;
  }

  /* Bright placeholder so the prompt reads clearly against the dark surface. */
  .form-control::placeholder,
  input::placeholder {
    color: rgba(255, 255, 255, 0.7) !important;
    opacity: 1; /* Firefox dims placeholders by default; reset. */
  }
`;

const FilterRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 1.2rem;
`;

const FilterPill = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid
    ${(p) =>
      p.$active
        ? 'rgba(94, 208, 255, 0.5)'
        : 'rgba(94, 208, 255, 0.08)'};
  background: ${(p) =>
    p.$active ? 'rgba(94, 208, 255, 0.14)' : 'rgba(94, 208, 255, 0.03)'};
  color: ${(p) =>
    p.$active ? p.theme.colors.morMain : 'rgba(255, 255, 255, 0.7)'};
  font-size: 1.15rem;
  font-weight: 500;
  letter-spacing: 0.2px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;

  &:hover {
    background: ${(p) =>
      p.$active ? 'rgba(94, 208, 255, 0.2)' : 'rgba(94, 208, 255, 0.06)'};
    color: ${(p) =>
      p.$active ? p.theme.colors.morMain : 'rgba(255, 255, 255, 0.9)'};
  }

  &:focus-visible {
    outline: 2px solid rgba(94, 208, 255, 0.5);
    outline-offset: 2px;
  }
`;

const SortRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const SortLabel = styled.span`
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  margin-right: 2px;
`;

const FilterCount = styled.span<{ $active: boolean }>`
  font-size: 0.95rem;
  padding: 1px 6px;
  border-radius: 8px;
  background: ${(p) =>
    p.$active ? 'rgba(94, 208, 255, 0.18)' : 'rgba(94, 208, 255, 0.06)'};
  color: ${(p) =>
    p.$active ? p.theme.colors.morMain : 'rgba(255, 255, 255, 0.55)'};
`;

const Body = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 1.4rem 2.4rem 2rem;

  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: ${(p) => p.theme.radii.sm};
  }
`;

const Section = styled.section`
  & + & { margin-top: 1.8rem; }
`;

const SectionLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0.4px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 0.8rem;
  padding-left: 0.2rem;
`;

const SectionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SectionHint = styled.span`
  color: rgba(255, 255, 255, 0.3);
  font-weight: 400;
  font-size: 0.95rem;
  letter-spacing: 0.2px;
  text-transform: none;
`;

const InfoToggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 2px 6px;
  background: transparent;
  border: none;
  border-radius: ${(p) => p.theme.radii.sm};
  color: rgba(173, 211, 255, 0.95);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.2px;
  text-transform: none;
  cursor: pointer;

  &:hover {
    background: rgba(125, 188, 255, 0.12);
  }

  &:focus-visible {
    outline: 2px solid rgba(125, 188, 255, 0.5);
    outline-offset: 2px;
  }
`;

const InfoPanel = styled.div`
  margin-bottom: 0.9rem;
  padding: 1rem 1.2rem;
  border: 1px solid rgba(125, 188, 255, 0.25);
  border-radius: 8px;
  background: rgba(125, 188, 255, 0.08);
  color: rgba(214, 232, 255, 0.92);
  font-size: 1.2rem;
  line-height: 1.5;
`;

const EmptyState = styled.div`
  padding: 5rem 2rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 1.35rem;
  line-height: 1.5;

  svg { opacity: 0.4; margin-bottom: 1rem; }
`;

const BidsLoadingHint = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 1rem;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.5);

  &::before {
    content: '';
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-top-color: ${(p) => p.theme.colors.morMain};
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
  }
`;

type FilterId = 'all' | 'llm' | 'embeddings' | 'tts' | 'stt' | 'local' | 'tee';

type SortId = 'best' | 'providers' | 'price';

const SORTS: { id: SortId; label: string }[] = [
  { id: 'best', label: 'Best match' },
  { id: 'providers', label: 'Most providers' },
  { id: 'price', label: 'Lowest price' },
];

// Number of live bids = number of providers actually offering this model. This
// is the number that decides whether the model survives a dead provider: the
// router picks the provider, so a single-bid model has no fallback when that
// one provider stops serving.
const providerCount = (m: any) => (m?.bids || []).filter((b: any) => b?.Id).length;

// Cheapest live bid, in wei/sec. Local models are free. A model with no live
// bid sorts last (Infinity), never first.
const minPricePerSec = (m: any) => {
  if (m?.isLocal) return 0;
  const prices = (m?.bids || [])
    .map((b: any) => Number(b.PricePerSecond))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
};

const FILTERS: { id: FilterId; label: string; modality?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'llm', label: 'LLM', modality: 'llm' },
  { id: 'embeddings', label: 'Embeddings', modality: 'embeddings' },
  { id: 'tts', label: 'Text-to-Speech', modality: 'tts' },
  { id: 'stt', label: 'Speech-to-Text', modality: 'stt' },
  { id: 'tee', label: 'Secure' },
  { id: 'local', label: 'Local' },
];

const isTee = (m: any) => isSecureModel(m);

function hasModality(tags: any[] = [], modality: string) {
  return tags.some((t: any) => String(t).toLowerCase() === modality);
}

// Search used to be a single contiguous substring test, so the separators in a
// model's name silently decided whether you could find it: "deepseek" and "v4"
// both matched `deepseek-v4-pro`, but "deepseek v4 pro" matched nothing, because
// the hyphens are not spaces. Nobody types the hyphens.
//
// So: flatten every separator to a space on BOTH sides, then match on tokens
// rather than on one exact run of characters. Word order stops mattering too
// ("pro deepseek" finds it), which is what people expect from a search box.
const normalize = (s: any) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Any score at or above this means every token in the query was found.
const FULL_MATCH = 600;

/**
 * How well a model matches the query. 0 means no token matched at all.
 * Higher is closer, so results can be ranked rather than merely filtered.
 */
function scoreModel(model: any, q: string): number {
  const query = normalize(q);
  if (!query) return 1; // no query: everything ties, ordering falls to the sort below

  const tokens = query.split(' ').filter(Boolean);
  const name = normalize(model.Name);
  const haystack = `${name} ${(model.Tags || []).map(normalize).join(' ')}`.trim();

  if (name === query) return 1000; // exact name
  if (name.startsWith(query)) return 900;
  if (name.includes(query)) return 800; // contiguous run inside the name
  if (tokens.every((t) => name.includes(t))) return 700; // all tokens, any order
  if (tokens.every((t) => haystack.includes(t))) return FULL_MATCH; // ...incl. tags

  // Not everything matched. Score by how much did, so we can still offer the
  // closest results instead of an empty list.
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits === 0 ? 0 : Math.round((hits / tokens.length) * 100);
}

/**
 * The models a query admits, best match first — the single source of truth for
 * BOTH the visible list and the filter-pill counts, so the two can never
 * disagree about what "matches".
 */
function searchModels(models: any[], q: string): any[] {
  const scored = models
    .map((model) => ({ model, score: scoreModel(model, q) }))
    .filter((x) => x.score > 0);

  // Prefer models that matched every token. Only if none did do we fall back to
  // partial matches — so a real query never dead-ends on an empty list, but a
  // good query is never polluted by loose matches either.
  const complete = scored.filter((x) => x.score >= FULL_MATCH);
  const pool = complete.length > 0 ? complete : scored;

  return pool.sort((a, b) => b.score - a.score).map((x) => x.model);
}

const ModelSelectionModal = ({
  isActive,
  handleClose,
  models,
  onChangeModel,
  symbol,
  providersAvailability,
  bidsLoading,
}: any) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [sortBy, setSortBy] = useState<SortId>('best');
  const [showTeeInfo, setShowTeeInfo] = useState(false);

  // Annotate each model with `isOnline` (true for local, otherwise derived
  // from provider availability checks). Sort online first within each section.
  //
  // NB: hooks must run on every render — keep `useMemo` BEFORE the
  // `isActive` early-return, otherwise the hook count changes between
  // renders and React throws "Rendered more hooks than during the previous
  // render".
  const enriched = useMemo(
    () =>
      (models || []).map((m: any) => {
        if (m.isLocal || !providersAvailability) {
          return { ...m, isOnline: true };
        }
        const info = (m.bids || []).reduce((acc: any, next: any) => {
          const entry = providersAvailability.find(
            (pa: any) => pa.id == next.Provider,
          );
          if (!entry) return acc;
          if (entry.isOnline) return acc;
          const online = entry.status != 'disconnected';
          return { isOnline: online, lastCheck: !online ? entry.time : undefined };
        }, {});
        return { ...m, ...info };
      }),
    [models, providersAvailability],
  );

  // Everything the query admits, ranked. Both the counts and the list below are
  // derived from this one array, so a pill can never claim 0 while the list
  // underneath it shows results.
  const searched = useMemo(
    () => searchModels(enriched, search),
    [enriched, search],
  );

  const matchesFilter = (m: any, f: FilterId) => {
    const tags = m.Tags || [];
    switch (f) {
      case 'all':
        return true;
      case 'local':
        return !!m.isLocal;
      case 'tee':
        return isTee(m);
      case 'llm':
        return hasModality(tags, 'llm') || hasModality(tags, 'chat');
      case 'embeddings':
        return (
          hasModality(tags, 'embeddings') || hasModality(tags, 'embedding')
        );
      case 'tts':
        return hasModality(tags, 'tts');
      case 'stt':
        return hasModality(tags, 'stt');
    }
  };

  // Live counts per pill, so an empty filter can look disabled.
  const counts: Record<FilterId, number> = useMemo(() => {
    const c: Record<FilterId, number> = {
      all: 0, llm: 0, embeddings: 0, tts: 0, stt: 0, tee: 0, local: 0,
    };
    for (const m of searched) {
      for (const f of Object.keys(c) as FilterId[]) {
        if (matchesFilter(m, f)) c[f]++;
      }
    }
    return c;
  }, [searched]);

  const visible = useMemo(() => {
    const byTab = searched.filter((m: any) => matchesFilter(m, filter));
    const byName = (x: any, y: any) =>
      (x.Name || '').localeCompare(y.Name || '');

    // An explicit sort overrides relevance ranking — the user asked for this
    // order, so give them exactly it.
    if (sortBy === 'providers') {
      return [...byTab].sort(
        (x: any, y: any) => providerCount(y) - providerCount(x) || byName(x, y),
      );
    }

    if (sortBy === 'price') {
      return [...byTab].sort((x: any, y: any) => {
        const a = minPricePerSec(x);
        const b = minPricePerSec(y);
        // `!==` keeps Infinity - Infinity (NaN) out of the comparator; models
        // with no live bid tie with each other and fall to the bottom.
        if (a !== b) return a - b;
        return byName(x, y);
      });
    }

    // `searched` is already ranked best-match-first. With no query every score
    // ties, so this sort is what actually orders the list: online first, then
    // local, then alphabetical — the original behaviour.
    if (!normalize(search)) {
      return [...byTab].sort((x: any, y: any) => {
        if (!!y.isOnline !== !!x.isOnline) return y.isOnline ? 1 : -1;
        if (!!y.isLocal !== !!x.isLocal) return y.isLocal ? 1 : -1;
        return byName(x, y);
      });
    }

    return byTab;
  }, [searched, search, filter, sortBy]);

  // Bail out *after* all hooks have run.
  if (!isActive) return null;

  const handlePick = (data: any) => {
    onChangeModel(data);
    handleClose();
  };

  // Section buckets: Local → TEE → Marketplace.
  // TEE models surface in their own section (not duplicated under Marketplace)
  // so privacy-sensitive options are visually unambiguous.
  //
  // An explicit sort COLLAPSES the sections. Sorting inside Local → TEE →
  // Marketplace buckets cannot put the cheapest model at the top of the list —
  // the buckets outrank the sort — so "Lowest price" would reorder nothing the
  // user can see. When they ask for a ranking, give them one flat ranked list.
  const isRanked = sortBy !== 'best';
  const localModels = isRanked ? [] : visible.filter((m: any) => m.isLocal);
  const teeModels = isRanked
    ? []
    : visible.filter((m: any) => !m.isLocal && isTee(m));
  const remoteModels = isRanked
    ? []
    : visible.filter((m: any) => !m.isLocal && !isTee(m));
  const rankedModels = isRanked ? visible : [];

  const filterIconFor = (id: FilterId) => {
    switch (id) {
      case 'llm': return <IconMessage size={13} stroke={2} />;
      case 'embeddings': return <IconVector size={13} stroke={2} />;
      case 'tts': return <IconHeadphones size={13} stroke={2} />;
      case 'stt': return <IconMicrophone size={13} stroke={2} />;
      case 'tee': return <IconShieldLock size={13} stroke={2} />;
      case 'local': return <IconHome size={13} stroke={2} />;
      default: return null;
    }
  };

  return (
    <Modal
      onClose={() => {
        setSearch('');
        setFilter('all');
        setSortBy('best');
        setShowTeeInfo(false);
        handleClose();
      }}
      bodyProps={bodyProps}
    >
      <Layout>
        <Header>
          <TitleRow>
            <Title>New chat</Title>
            {/* Only surface the counter when filtering/search actually hides
                models — otherwise "N of N" is noise. */}
            {visible.length !== enriched.length && (
              <ResultCount>
                {visible.length} of {enriched.length}{' '}
                {enriched.length === 1 ? 'model' : 'models'}
              </ResultCount>
            )}
          </TitleRow>
          <SearchWrapper>
            <InputGroup>
              <InputGroup.Text>
                <IconSearch size={18} />
              </InputGroup.Text>
              <Form.Control
                type="text"
                placeholder="Search models or tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                style={{
                  background: 'transparent',
                  color: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  boxShadow: 'none',
                  outline: 'none',
                  fontSize: '1.35rem',
                }}
              />
            </InputGroup>
          </SearchWrapper>
          <FilterRow>
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count = counts[f.id];
              return (
                <FilterPill
                  key={f.id}
                  $active={active}
                  type="button"
                  onClick={() => setFilter(f.id)}
                >
                  {filterIconFor(f.id)}
                  {f.label}
                  <FilterCount $active={active}>{count}</FilterCount>
                </FilterPill>
              );
            })}
          </FilterRow>
          <SortRow>
            <SortLabel>Sort</SortLabel>
            {SORTS.map((s) => {
              const active = sortBy === s.id;
              return (
                <FilterPill
                  key={s.id}
                  $active={active}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSortBy(s.id)}
                >
                  {s.id === 'providers' ? (
                    <IconUsers size={13} stroke={2} />
                  ) : s.id === 'price' ? (
                    <IconCoin size={13} stroke={2} />
                  ) : (
                    <IconSparkles size={13} stroke={2} />
                  )}
                  {s.label}
                </FilterPill>
              );
            })}
          </SortRow>
          {bidsLoading && (
            <BidsLoadingHint>
              Loading marketplace options… local models are ready to use.
            </BidsLoadingHint>
          )}
        </Header>

        <Body>
          {visible.length === 0 && (
            <EmptyState>
              <IconWorld size={36} stroke={1.5} />
              <div>
                {search.trim()
                  ? 'No models match your search.'
                  : 'No models available for this filter.'}
              </div>
            </EmptyState>
          )}

          {rankedModels.length > 0 && (
            <Section>
              <SectionLabel>
                {sortBy === 'price' ? (
                  <IconCoin size={13} stroke={2} />
                ) : (
                  <IconUsers size={13} stroke={2} />
                )}
                {sortBy === 'price' ? 'Lowest price first' : 'Most providers first'}
                <SectionHint>all models</SectionHint>
              </SectionLabel>
              <SectionList>
                {rankedModels.map((m: any) => (
                  <ModelRow
                    key={m.Id}
                    model={m}
                    symbol={symbol}
                    onChangeModel={handlePick}
                  />
                ))}
              </SectionList>
            </Section>
          )}

          {localModels.length > 0 && (
            <Section>
              <SectionLabel>
                <IconHome size={13} stroke={2} />
                Local
              </SectionLabel>
              <SectionList>
                {localModels.map((m: any) => (
                  <ModelRow
                    key={m.Id}
                    model={m}
                    symbol={symbol}
                    onChangeModel={handlePick}
                  />
                ))}
              </SectionList>
            </Section>
          )}

          {teeModels.length > 0 && (
            <Section>
              <SectionLabel>
                <IconShieldLock size={13} stroke={2} />
                Secure&nbsp;
                <SectionHint>(Trusted Execution Environment)</SectionHint>
                <InfoToggle
                  type="button"
                  aria-expanded={showTeeInfo}
                  onClick={() => setShowTeeInfo((v) => !v)}
                >
                  <IconInfoCircle size={13} stroke={2} />
                  What is this?
                </InfoToggle>
              </SectionLabel>
              {showTeeInfo && <InfoPanel>{SECURE_MODE_INFO}</InfoPanel>}
              <SectionList>
                {teeModels.map((m: any) => (
                  <ModelRow
                    key={m.Id}
                    model={m}
                    symbol={symbol}
                    onChangeModel={handlePick}
                  />
                ))}
              </SectionList>
            </Section>
          )}

          {remoteModels.length > 0 && (
            <Section>
              <SectionLabel>
                <IconWorld size={13} stroke={2} />
                Marketplace
              </SectionLabel>
              <SectionList>
                {remoteModels.map((m: any) => (
                  <ModelRow
                    key={m.Id}
                    model={m}
                    symbol={symbol}
                    onChangeModel={handlePick}
                  />
                ))}
              </SectionList>
            </Section>
          )}
        </Body>
      </Layout>
    </Modal>
  );
};

export default ModelSelectionModal;
