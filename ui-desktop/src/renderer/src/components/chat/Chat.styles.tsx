import styled, { css, keyframes } from 'styled-components';
import TextareaAutosize from 'react-textarea-autosize';
import Drawer from 'react-modern-drawer';

// The history drawer. react-modern-drawer renders its own element, so this panel
// used to be styled from a plain `.history-drawer` class in Chat.css — a file
// that sits OUTSIDE styled-components, where the theme can never reach it. That
// forced a hardcoded colour and a "keep in sync with ui/theme.tsx" comment,
// which is drift waiting to happen: it had already gone stale once (a pre-Aurora
// green while everything around it turned blue), and a literal there would have
// pinned the drawer to one theme while the rest of the app swapped.
//
// Wrapping the component here instead lets the panel read tokens like every
// other surface, and retires Chat.css entirely.
export const HistoryDrawer = styled(Drawer)`
  width: 40% !important;
  min-width: 400px !important;
  padding: 2.4rem !important;
  border-left: 1px solid ${(p) => p.theme.colors.glassBorder} !important;
  background: ${(p) => p.theme.colors.primary} !important;
`;

// The orb's idle breath — the native app rides the live audio level; with no
// level to ride, it breathes slowly instead of sitting dead.
const orbBreathe = keyframes`
  0%, 100% { transform: scale(1);    opacity: 0.9; }
  50%      { transform: scale(1.06); opacity: 1; }
`;

// JARVIS's THINKING state (Orb.swift): the ring sweeps. An arc, not a full ring,
// so the rotation is actually visible — a spinning complete circle looks static.
const orbSweep = keyframes`
  to { transform: rotate(360deg); }
`;

// Chat owns its scrolling: the page must NEVER grow — the history pane flexes
// and scrolls inside it, and the composer stays pinned. Without display:flex
// here, Container's flex:1/min-height:0 were no-ops, the content grew past
// 100vh and Main's overflow:hidden clipped it: messages became unreachable
// and the composer slid below the fold as replies streamed in.
export const View = styled.div`
  height: 100vh;
  max-width: 100%;
  min-width: 600px;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const Container = styled.div`
  max-width: 1120px;
  /* was calc(100% - 200px) — a magic number that left the composer floating
     away from the bottom edge. Fill what the header leaves behind instead. */
  flex: 1;
  min-height: 0;
  justify-content: space-between;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 20px 2.4rem 0;
`;

export const ChatBlock = styled.div`
  width: 100%;
  height: 100%;
  overflow-y: auto;
  margin-bottom: 20px;

  &.createSessionMode {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &.createSessionMode .session-container {
    width: 450px;
    padding: 1rem;
    background-color: ${(p) => p.theme.colors.glassSurface};
    border: 1px solid ${(p) => p.theme.colors.brandTint(0.22)};
  }

  &.createSessionMode .session-title {
    text-align: center;
    margin-bottom: 10px;
  }
`;

export const ChatHistoryContainer = styled.div`
  /* height:100% inside a flex column resolves against an auto-sized parent, so
     this box just grew with the conversation and never scrolled. A flex child
     also needs min-height:0 to be ALLOWED to shrink below its content — that is
     the whole bug. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
`;

export const ChatIntroContainer = styled.div`
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const ChatIntroInner = styled.div`
  width: 100%;
  max-width: 52rem;
  padding: 3.2rem;
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  border-radius: ${(p) => p.theme.radii.lg};
  text-align: center;
`;

export const ChatIntroInnerTitle = styled.h2`
  font-size: 20px;
  font-weight: 600;
`;

// Same object as the send control (SendRoundBtn): a ring of light in the brand
// blue, not a solid slab. Text buttons in the chat intro are the pill form of
// that ring. `type: button` is explicit because these sit outside a form and
// must never submit one.
export const ChatIntroButton = styled.button.attrs({ type: 'button' })`
  min-width: 215px;
  padding: 1rem 2.4rem;
  border-radius: ${(p) => p.theme.radii.pill};
  font-family: inherit;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.2px;
  cursor: pointer;
  color: ${(p) => p.theme.colors.morMain};
  background: ${(p) => p.theme.colors.brandTint(0.06)};
  border: 1.5px solid ${(p) => p.theme.colors.brandTint(0.85)};
  box-shadow:
    0 0 12px ${(p) => p.theme.colors.brandTint(0.45)},
    inset 0 0 8px ${(p) => p.theme.colors.brandTint(0.18)};
  transition:
    box-shadow 0.15s ease,
    background 0.15s ease;

  &:hover:not([disabled]) {
    background: ${(p) => p.theme.colors.brandTint(0.14)};
    box-shadow:
      0 0 18px ${(p) => p.theme.colors.brandTint(0.65)},
      inset 0 0 10px ${(p) => p.theme.colors.brandTint(0.28)};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.morMain};
    outline-offset: 2px;
  }

  &[disabled] {
    opacity: 0.35;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const ChatIntroInnerText = styled.p`
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 400;
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textSecondary};
  margin-top: 2.4rem;
  margin-bottom: 1.6rem;
`;

// The partial-affordability notice. Amber comes from the theme so it swaps with
// the variant; the warning itself is carried by the TEXT ("covers N of M"), with
// colour only reinforcing it — this is a money surface, and money surfaces never
// state anything by colour alone.
export const ChatIntroWarningText = styled(ChatIntroInnerText)`
  color: ${(p) => p.theme.colors.warning};
  font-weight: 500;
`;

export const Control = styled.div`
  height: fit-content;
  position: relative;
  display: flex;
  flex-direction: column;

  textarea {
    resize: none;
    padding-right: 6rem;
  }

  textarea:focus,
  input:focus {
    outline: none !important;
  }
`;

export const SendBtnWrapper = styled.div`
  position: absolute;
  right: 16px;
  bottom: 12px;
  display: flex;
  gap: 10px;
`;

// The reopen actions (Staking / Direct Pay) shown when a session has expired.
// They used to be solid brand-blue slabs with textPrimary on top — a washed-out,
// low-contrast label on a bright fill, and the same "this is a button" shout the
// tooltip was making. They now wear the ring of light: the send control's object
// (SendRoundBtn), in pill form, the same as ChatIntroButton.
export const Btn = styled.button.attrs({ type: 'button' })`
  height: 36px;
  min-width: 36px;
  padding: 0 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  border-radius: ${(p) => p.theme.radii.pill};
  font-family: inherit;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.2px;
  cursor: pointer;
  color: ${(p) => p.theme.colors.morMain};
  background: ${(p) => p.theme.colors.brandTint(0.06)};
  border: 1.5px solid ${(p) => p.theme.colors.brandTint(0.85)};
  box-shadow:
    0 0 12px ${(p) => p.theme.colors.brandTint(0.45)},
    inset 0 0 8px ${(p) => p.theme.colors.brandTint(0.18)};
  transition:
    box-shadow 0.15s ease,
    background 0.15s ease;

  &:hover:not([disabled]) {
    background: ${(p) => p.theme.colors.brandTint(0.14)};
    box-shadow:
      0 0 18px ${(p) => p.theme.colors.brandTint(0.65)},
      inset 0 0 10px ${(p) => p.theme.colors.brandTint(0.28)};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.morMain};
    outline-offset: 2px;
  }

  &[disabled] {
    opacity: 0.35;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const SendBtn = styled(Btn)`
  position: absolute;
  right: 16px;
  width: fit-content;
`;

export const Avatar = styled.div`
  height: 36px;
  min-width: 36px;
  width: 36px;
  border-radius: ${(p) => p.theme.radii.pill};
  display: flex;
  justify-content: center;
  align-items: center;
  /* border: 1px solid; */
  background: ${(p) => p.color};
  font-weight: 400;
  font-size: 15px;
  border-radius: ${(p) => p.theme.radii.sm};
`;

export const AvatarHeader = styled.div`
  color: ${(p) => p.theme.colors.morMain};
  font-weight: 900;
  padding: 0 8px;
  font-size: 18px;
  line-height: 18px;
  margin-bottom: 5px;
`;

// Lives inside a Bubble now — the bubble owns width and padding.
export const MessageBody = styled.div`
  font-weight: 400;
  font-size: 16px;
  line-height: 1.55;
  max-width: 100%;
  min-width: 0;
  overflow-wrap: break-word;

  code {
    color: ${(p) => p.theme.colors.morMain};
  }
`;

// Chat bubbles: the user's turns sit on the RIGHT in a brand-tinted panel,
// the model's on the LEFT in glass. Side + material identify the speaker —
// no name headers. The flattened bottom corner points at the sender.
export const MessageRow = styled.div<{ $user?: boolean }>`
  display: flex;
  gap: 1.2rem;
  margin: 12px 0 14px 0;
  justify-content: ${(p) => (p.$user ? 'flex-end' : 'flex-start')};
`;

// One turn = bubble + its action row, stacked in NORMAL FLOW. The actions
// must live inside their parent's box: two absolute-positioning attempts
// left them outside the bubble's hover geometry, and since the hidden state
// is pointer-events:none, an outside button can never re-enable itself —
// hovering it hit-tests to nothing (circular). In flow, the column's own box
// contains the buttons' area, the pointer falls through the inert child to
// the column, :hover holds, and the buttons become clickable.
export const TurnColumn = styled.div<{ $user?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: ${(p) => (p.$user ? 'flex-end' : 'flex-start')};
  max-width: 82%;
  min-width: 0;

  &:hover .msg-actions {
    opacity: 1;
    pointer-events: auto;
  }
`;

export const Bubble = styled.div<{ $user?: boolean }>`
  position: relative;
  min-width: 0;
  max-width: 100%;
  padding: 1rem 1.4rem;
  border-radius: 14px;
  border-bottom-right-radius: ${(p) => (p.$user ? '4px' : '14px')};
  border-bottom-left-radius: ${(p) => (p.$user ? '14px' : '4px')};
  background: ${(p) =>
    p.$user ? p.theme.colors.brandTint(0.1) : p.theme.colors.glassSurface};
  border: 1px solid
    ${(p) =>
      p.$user ? p.theme.colors.brandTint(0.35) : p.theme.colors.glassBorder};
`;

// Reserved-height action row under the bubble (8px clear of it) — space is
// held in flow so revealing it never shifts layout.
export const MsgActions = styled.div<{ $user?: boolean }>`
  display: flex;
  gap: 6px;
  margin-top: 8px;
  min-height: 24px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
`;

export const MsgActionBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  font-size: 11px;
  letter-spacing: 0.04em;
  border-radius: 8px;
  background: ${(p) => p.theme.colors.voidElevated};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  color: ${(p) => p.theme.colors.textSecondary};
  cursor: pointer;

  &:hover {
    color: ${(p) => p.theme.colors.morMain};
    border-color: ${(p) => p.theme.colors.brandTint(0.5)};
  }
`;

// The send action: a circular ring of light in the brand blue around a blue
// up-arrow — not a solid slab. Glow is fine here (non-money CTA).
export const SendRoundBtn = styled.button`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.brandTint(0.06)};
  color: ${(p) => p.theme.colors.morMain};
  border: 1.5px solid ${(p) => p.theme.colors.brandTint(0.85)};
  box-shadow:
    0 0 12px ${(p) => p.theme.colors.brandTint(0.45)},
    inset 0 0 8px ${(p) => p.theme.colors.brandTint(0.18)};
  cursor: pointer;
  transition:
    box-shadow 0.15s ease,
    background 0.15s ease;

  &:hover:not([disabled]) {
    background: ${(p) => p.theme.colors.brandTint(0.14)};
    box-shadow:
      0 0 18px ${(p) => p.theme.colors.brandTint(0.65)},
      inset 0 0 10px ${(p) => p.theme.colors.brandTint(0.28)};
  }

  &[disabled] {
    opacity: 0.35;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const ChatTitleContainer = styled.div`
  color: ${(p) => p.theme.colors.morMain};
  font-weight: 900;
  padding: 0 8px;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid ${(p) => p.theme.colors.brandTint(0.22)};
`;

export const ChatAvatar = styled.div`
  display: flex;
  align-items: center;
`;

export const CustomTextArrea = styled(TextareaAutosize)`
  background: transparent;
  box-sizing: border-box;
  width: 100%;
  border: none;
  font-size: ${(p) => p.theme.type.base};
  line-height: 1.5;
  border-radius: ${(p) => p.theme.radii.md};
  color: ${(p) => p.theme.colors.textPrimary};
  padding: 1.2rem 6rem 1.2rem 1.4rem;

  &::placeholder {
    color: ${(p) => p.theme.colors.textSecondary};
  }

  &::focus {
    outline: none !important;
  }

  textarea:focus,
  input:focus {
    outline: none !important;
  }
`;

export const ContainerTitle = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  width: 100%;
  padding: 0 2.4rem;
  z-index: 2;
  right: 0;
  left: 0;
  top: 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.brandTint(0.22)};
`;

export const TitleRow = styled.div`
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

export const Title = styled.label`
  font-size: 2.4rem;
  line-height: 3rem;
  white-space: nowrap;
  margin: 0;
  max-width: 1120px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.morMain};
  margin-bottom: 4.8px;
  margin-right: 2.4rem;
  cursor: default;
  /* width: 100%; */

  @media (min-width: 1140px) {
  }

  @media (min-width: 1200px) {
  }
`;

export const LoadingCover = styled.div`
  width: 100%;
  height: 100%;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(p) => p.theme.colors.scrim};

  z-index: 5;
`;

export const ImageContainer = styled.img`
  cursor: pointer;
  padding: 0.25rem;
  /* Was \${morMain}B3 — appending a hex alpha to a token only works while the
     token happens to BE a hex. Under classic, morMain is 'rgba(32,220,142,1)',
     so this produced 'rgba(32,220,142,1)B3': invalid CSS, and the declaration
     was dropped entirely. B3 = 0.7. */
  background-color: ${(p) => p.theme.colors.brandTint(0.7)};
  border: var(--bs-border-width) solid var(--bs-highlight-color);
  border-radius: var(--bs-border-radius);
  max-width: 100%;
  height: 256px;

  @media (min-height: 700px) {
    height: 320px;
  }
`;

export const VideoContainer = styled.div`
  cursor: pointer;
  padding: 0.25rem;
  max-width: 100%;
  height: 256px;

  @media (min-height: 700px) {
    height: 320px;
  }
`;

export const SubPriceLabel = styled.span`
  color: ${(p) => p.theme.colors.morMain};
`;

export const AudioInputZone = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border: 1px dashed ${(p) => p.theme.colors.glassBorder};
  border-radius: 12px;

  &[data-disabled='true'] {
    opacity: 0.5;
    pointer-events: none;
  }
`;

export const AudioActionBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid ${(p) => p.theme.colors.morMain};
  background: transparent;
  color: ${(p) => p.theme.colors.morMain};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;

  &:hover {
    background: ${(p) => p.theme.colors.brandTint(0.12)};
  }

  &[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &[data-recording='true'] {
    border-color: ${(p) => p.theme.colors.danger};
    color: ${(p) => p.theme.colors.danger};
    background: ${(p) => p.theme.colors.dangerTint(0.12)};
  }
`;

export const AudioHint = styled.span`
  font-size: 13px;
  color: ${(p) => p.theme.colors.textMuted};
`;

export const TtsControlsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 0 16px 10px;
  font-size: 13px;
  color: ${(p) => p.theme.colors.textSecondary};

  label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }

  select,
  input[type='text'] {
    background: ${(p) => p.theme.colors.brandTint(0.06)};
    border: 1px solid ${(p) => p.theme.colors.brandTint(0.22)};
    border-radius: ${(p) => p.theme.radii.sm};
    color: ${(p) => p.theme.colors.textPrimary};
    padding: 4px 8px;
    font-size: 13px;
  }

  select:focus,
  input:focus {
    outline: none !important;
    border-color: ${(p) => p.theme.colors.morMain};
  }
`;

export const AudioPlayer = styled.audio`
  width: 320px;
  max-width: 100%;
  margin-top: 4px;
`;

// ============================================================================
// Aurora chat surfaces — one header, a real empty state, a dominant composer.
//
// Replaces a layout whose visual weight was inverted: "New chat" (a utility)
// was the loudest object on screen while the composer (the actual point of the
// page) was a near-invisible outline, and ~60% of the view was undesigned void.
// Green is spent on ONE thing here — the send action and the live dot — instead
// of on the model name, the avatar, the New chat fill and inline code at once.
// ============================================================================

export const ChatHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;
  padding: 1.6rem 2.4rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

export const ChatIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  min-width: 0;
`;

// JARVIS's voice orb (Orb.swift), at rest.
//
// The native orb is a ring that breathes with the live mic/playback level,
// wrapped around a glowing ◈. Here there is no audio level to ride, so it wears
// the idle form of the same object: the ring, the inner ring, the glowing
// diamond, and a slow breath — recognisably the same presence, not a decoration
// invented to look like one. Replaces a hard green square holding a letter.
export const ModelGlyph = styled.div<{ $thinking?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  flex-shrink: 0;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.brandTint(0.1)};
  color: ${(p) => p.theme.colors.brand};
  font-size: 1.8rem;
  line-height: 1;
  text-shadow: 0 0 8px ${(p) => p.theme.colors.brandTint(0.7)};

  /* outer ring — the part that breathes */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: ${(p) => p.theme.radii.pill};
    border: 2px solid ${(p) => p.theme.colors.brandTint(0.9)};
    animation: ${orbBreathe} 3.4s ease-in-out infinite;
  }

  /* inner ring — and, while the model is thinking, a sweeping arc: the ring
     spins the way the native orb's does when JARVIS is working. */
  &::after {
    content: '';
    position: absolute;
    inset: 0.55rem;
    border-radius: ${(p) => p.theme.radii.pill};
    border: 1px solid ${(p) => p.theme.colors.brandTint(0.45)};
    ${(p) =>
      p.$thinking &&
      css`
        border: 2px solid transparent;
        border-top-color: ${p.theme.colors.brand};
        border-right-color: ${p.theme.colors.brand};
        animation: ${orbSweep} 0.9s linear infinite;
      `}
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
    }
  }
`;

export const ModelMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
`;

// A model name is a LABEL, not a call to action. It was 900-weight brand green,
// out-shouting the thing it sits above.
export const ModelName = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: ${(p) => p.theme.type.base};
  font-weight: 600;
  color: ${(p) => p.theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const ModelSubline = styled.div`
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.textSecondary};
  white-space: nowrap;
`;

export const LiveDot = styled.span`
  width: 0.7rem;
  height: 0.7rem;
  flex-shrink: 0;
  border-radius: ${(p) => p.theme.radii.pill};
  /* Liveness, not an action — green keeps its one job in the HUD language. */
  background: ${(p) => p.theme.colors.success};
  box-shadow: 0 0 8px ${(p) => p.theme.colors.successTint(0.8)};
`;

export const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-shrink: 0;
`;

// Demoted from a solid brand fill to a quiet control. It is a utility action.
export const HeaderBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 40px;
  padding: 0.8rem 1.2rem;
  font: inherit;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  cursor: pointer;
  color: ${(p) => p.theme.colors.textSecondary};
  background: transparent;
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  border-radius: ${(p) => p.theme.radii.md};
  transition: color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    background ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover {
    color: ${(p) => p.theme.colors.textPrimary};
    background: ${(p) => p.theme.colors.glassSurface};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const SecureBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.8rem;
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 600;
  letter-spacing: 0.3px;
  border-radius: ${(p) => p.theme.radii.pill};
  color: ${(p) => p.theme.colors.secondaryLight};
  background: ${(p) => p.theme.colors.brandTint(0.14)};
  cursor: default;
`;

// ---- empty state -----------------------------------------------------------
// The void this fills was the single worst thing about the screen: no greeting,
// no orientation, nothing to click. An empty chat should teach the app.

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.2rem;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  padding: 2.4rem;
  text-align: center;
`;

export const EmptyTitle = styled.h2`
  margin: 0;
  font-family: ${(p) => p.theme.fontUI};
  font-size: ${(p) => p.theme.type.xl};
  font-weight: 600;
  letter-spacing: -0.2px;
  color: ${(p) => p.theme.colors.textPrimary};
`;

export const EmptySubtitle = styled.p`
  margin: 0;
  max-width: 46rem;
  font-size: ${(p) => p.theme.type.base};
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const PromptGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.2rem;
  width: 100%;
  max-width: 62rem;
  margin-top: 1.6rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

export const PromptCard = styled.button`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.4rem 1.6rem;
  font: inherit;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
  color: ${(p) => p.theme.colors.textPrimary};
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  border-radius: ${(p) => p.theme.radii.lg};
  transition: transform ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    background ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  svg {
    flex-shrink: 0;
    margin-top: 0.1rem;
    color: ${(p) => p.theme.colors.textSecondary};
  }

  &:hover {
    transform: translateY(-1px);
    background: ${(p) => p.theme.colors.glassSurfaceHover};
    border-color: ${(p) => p.theme.colors.brandTint(0.35)};

    svg {
      color: ${(p) => p.theme.colors.brand};
    }
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

// ---- composer --------------------------------------------------------------
// The primary surface of the page, and it should look like it: a real elevated
// card that owns the brand focus ring, rather than a hairline box.

export const Composer = styled.div<{ $focused?: boolean }>`
  position: relative;
  display: flex;
  align-items: flex-end;
  width: 100%;
  padding: 0.6rem 0.6rem 0.6rem 0.4rem;
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid
    ${(p) => (p.$focused ? p.theme.colors.brand : p.theme.colors.glassBorder)};
  border-radius: ${(p) => p.theme.radii.lg};
  box-shadow: ${(p) =>
    p.$focused ? `0 0 0 3px ${p.theme.colors.brandTint(0.12)}` : 'none'};
  transition: border-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    box-shadow ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const ComposerHint = styled.div`
  margin: 0.8rem 0.4rem 0;
  font-size: ${(p) => p.theme.type.xs};
  color: ${(p) => p.theme.colors.textSecondary};
  text-align: center;
`;


// The orb again, at message scale. Same object as the header's ModelGlyph, so
// the thing answering you is visibly the same presence throughout.
export const MessageOrb = styled.div<{ $thinking?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.6rem;
  height: 3.6rem;
  flex-shrink: 0;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.brandTint(0.1)};
  color: ${(p) => p.theme.colors.brand};
  font-size: 1.6rem;
  line-height: 1;
  text-shadow: 0 0 8px ${(p) => p.theme.colors.brandTint(0.7)};

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: ${(p) => p.theme.radii.pill};
    border: 2px solid ${(p) => p.theme.colors.brandTint(0.85)};
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0.5rem;
    border-radius: ${(p) => p.theme.radii.pill};
    border: 1px solid ${(p) => p.theme.colors.brandTint(0.4)};
    ${(p) =>
      p.$thinking &&
      css`
        border: 2px solid transparent;
        border-top-color: ${p.theme.colors.brand};
        border-right-color: ${p.theme.colors.brand};
        animation: ${orbSweep} 0.9s linear infinite;
      `}
  }
`;
