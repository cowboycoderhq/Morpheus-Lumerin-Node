import styled, { keyframes, css } from 'styled-components';

// ============================================================================
// HUD primitives — the JARVIS console language, for the Models page.
//
// JARVIS (stark-hud/jarvis-server/console.html) is a terminal/HUD aesthetic:
// cyan on near-black, monospace throughout, uppercase letter-spaced labels,
// hairline panels with a faint glow, pulsing status orbs, and scanlines. That
// language suits this page specifically — Models is dense machine data (CIDs,
// hashes, prices, tags, IPFS state), which is exactly what a HUD is for, and
// exactly what prose-styled cards were failing to make scannable.
//
// It is built from the app's OWN tokens rather than raw hex, so the page reads
// as the same product rather than a second one bolted on — and, more to the
// point, so it follows the theme: every accent here comes from brandTint()/
// brand, which resolve to cyan under Aurora and green under Classic. The
// scanline comes from the `scanline` token, which Classic sets transparent to
// switch the HUD atmosphere off entirely. success/danger stay reserved for
// live/OK and error status, the meaning they carry everywhere else in the app.
// ============================================================================

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
`;

/** Uppercase, letter-spaced, monospace — the HUD's voice for any label. */
export const hudLabel = css`
  font-family: ${(p) => p.theme.fontMono};
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
`;

export const HudPage = styled.div`
  position: relative;
  max-width: 1120px;
  margin: 0 auto;
  width: 100%;
`;

/* Scanlines. Very low contrast (2%) and pointer-events:none — atmosphere, not
   texture you have to read through. Suppressed under reduced-motion prefs,
   which is where users sensitive to this kind of overlay live. */
export const Scanlines = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: repeating-linear-gradient(
    0deg,
    ${(p) => p.theme.colors.scanline} 0 1px,
    transparent 1px 3px
  );

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`;

export const HudHeader = styled.header`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
  flex-wrap: wrap;
  padding-bottom: 1.6rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.brandTint(0.26)};
`;

export const HudTitle = styled.h1`
  ${hudLabel};
  margin: 0;
  font-size: ${(p) => p.theme.type.base};
  letter-spacing: 0.42em;
  color: ${(p) => p.theme.colors.secondaryLight};
  text-shadow: 0 0 18px ${(p) => p.theme.colors.brandTint(0.45)};
`;

export const HudSubtitle = styled.p`
  margin: 1.2rem 0 0;
  max-width: 70rem;
  font-family: ${(p) => p.theme.fontMono};
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.6;
  color: ${(p) => p.theme.colors.textSecondary};
`;

/** Status orb — pulses when live, per the JARVIS console's #orb. */
export const Orb = styled.span<{ $on: boolean }>`
  width: 0.8rem;
  height: 0.8rem;
  flex: none;
  border-radius: 50%;
  background: ${(p) =>
    p.$on ? p.theme.colors.success : p.theme.colors.danger};
  box-shadow: ${(p) =>
    p.$on
      ? `0 0 10px ${p.theme.colors.success}`
      : `0 0 10px ${p.theme.colors.danger}`};

  ${(p) =>
    p.$on &&
    css`
      animation: ${pulse} 2.6s ease-in-out infinite;
    `};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const StatusLine = styled.div`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  margin: 1.6rem 0;
  padding: 0.6rem 1.2rem;
  ${hudLabel};
  letter-spacing: 0.1em;
  color: ${(p) => p.theme.colors.textSecondary};
  background: ${(p) => p.theme.colors.brandTint(0.05)};
  border: 1px solid ${(p) => p.theme.colors.brandTint(0.2)};
  border-radius: ${(p) => p.theme.radii.md};
`;

/** Primary HUD action — cyan tint, hairline, glow on hover. */
export const HudBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 40px;
  padding: 0.9rem 1.6rem;
  cursor: pointer;
  ${hudLabel};
  color: ${(p) => p.theme.colors.secondaryLight};
  background: ${(p) => p.theme.colors.brandTint(0.09)};
  border: 1px solid ${(p) => p.theme.colors.brandTint(0.5)};
  border-radius: ${(p) => p.theme.radii.md};
  transition:
    background ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    box-shadow ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover {
    background: ${(p) => p.theme.colors.brandTint(0.17)};
    box-shadow: 0 0 16px ${(p) => p.theme.colors.brandTint(0.22)};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/** The panel that holds the tabbed data tables. */
export const HudPanel = styled.section`
  position: relative;
  z-index: 1;
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.brandTint(0.26)};
  border-radius: ${(p) => p.theme.radii.lg};
  padding: 1.6rem 1.8rem 0.4rem;
`;

/* react-bootstrap Tabs, wearing the JARVIS tab treatment: uppercase mono,
   dim until active, then cyan with a glowing underline. */
export const HudTabsWrap = styled.div`
  /* Same segmented control as common/Tabs, so the app speaks one tab language:
     discrete pills, not folder tabs welded to the panel below. */
  #tab-models {
    gap: 0.8rem;
    border-bottom: none;
    margin-bottom: 1.8rem !important;

    .nav-link {
      ${hudLabel};
      letter-spacing: 0.16em;
      color: ${(p) => p.theme.colors.textSecondary};
      background: transparent;
      border: 1px solid ${(p) => p.theme.colors.brandTint(0.26)};
      border-radius: ${(p) => p.theme.radii.md};
      padding: 1rem 1.8rem;
      transition: color ${(p) => p.theme.motion.duration.fast} ${(p) =>
        p.theme.motion.easing.standard};

      &:hover {
        color: ${(p) => p.theme.colors.brandBright};
        background: ${(p) => p.theme.colors.brandTint(0.08)};
      }
    }

    .nav-link.active {
      color: ${(p) => p.theme.colors.brandBright};
      background: ${(p) => p.theme.colors.brandTint(0.14)};
      border: 1px solid ${(p) => p.theme.colors.brand};
      box-shadow: 0 0 16px ${(p) => p.theme.colors.brandTint(0.18)};
    }
  }
`;


// ---- search ----------------------------------------------------------------

export const SearchRow = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0 0 1.6rem;
  padding: 0 1.4rem;
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.brandTint(0.26)};
  border-radius: ${(p) => p.theme.radii.md};

  &:focus-within {
    border-color: ${(p) => p.theme.colors.brand};
    box-shadow: 0 0 0 3px ${(p) => p.theme.colors.brandTint(0.12)};
  }

  svg {
    flex-shrink: 0;
    color: ${(p) => p.theme.colors.textSecondary};
  }
`;

export const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 1.2rem 0;
  border: none;
  background: transparent;
  font-family: ${(p) => p.theme.fontUI};
  font-size: ${(p) => p.theme.type.sm};
  letter-spacing: 0.08em;
  color: ${(p) => p.theme.colors.textPrimary};

  &::placeholder {
    color: ${(p) => p.theme.colors.textSecondary};
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  &:focus {
    outline: none;
  }
`;

export const ResultCount = styled.span`
  ${hudLabel};
  flex-shrink: 0;
  color: ${(p) => p.theme.colors.textSecondary};
`;
