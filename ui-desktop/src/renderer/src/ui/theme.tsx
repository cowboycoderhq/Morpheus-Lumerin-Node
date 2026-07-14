// ============================================================================
// AURORA DESIGN SYSTEM — single source of truth for theme tokens.
//
// This file is read by every styled-component via `props => props.theme`.
// It intentionally keeps every LEGACY key that existing screens still read
// (see the "LEGACY ALIASES" block) aliased onto the new Aurora values, so no
// screen breaks while the re-skin rolls out phase-by-phase. New code should
// prefer the Aurora-named tokens (colors.brand, colors.moneySurface, etc.)
// over the legacy ones.
//
// Binding spec: outputs/morpheus-ui-reskin-design-direction-2026-07-10.md
// (COUNCIL SYNTHESIS — B1-B8). Notably:
//   B1/B6 — money surfaces are solid/effect-free; glass/glow intensity is a
//           dialable token (0 = plain mode), never forced.
//   B3    — success is a DISTINCT mint, not the brand green.
//   B5    — motion tokens are for event-driven feedback, not ambient loops.
// ============================================================================

const darkShade = 'rgba(0, 0, 0, 0.2)';

// ---- JARVIS palette --------------------------------------------------------
// The HUD language from stark-hud/jarvis-server/console.html, applied app-wide:
// cyan on near-black, monospace, hairline panels, glow, status orbs.
//
// The token NAMES are unchanged on purpose. Every screen already reads
// `colors.brand` / `colors.textPrimary` / `glassSurface`, so re-pointing the
// values here re-skins the whole app at once — rather than editing forty
// components and missing five.
//
// The one semantic change worth stating: `brand` is now CYAN (the accent, i.e.
// "act here"), and green is demoted to `success` — liveness/OK only. In JARVIS
// green never means "button", it means "the system is up".

const brand = '#6fd6ff'; // JARVIS cyan — accent / actions / the signature
const brandBright = '#c2efff'; // --acc2: brighter cyan for emphasis
const secondary = '#6fd6ff'; // info / data / links — same family now
const secondaryLight = '#c2efff';
const tertiary = '#7E61F8'; // violet — staking/premium moments, used sparingly
const success = '#59e3a7'; // --green: LIVE/OK only, never an action
const warning = '#f0c060'; // --amber
const danger = '#e05c73'; // --red, desaturated: it is a warning, not an alarm

const voidBase = '#04070c'; // --bg
const voidElevated = 'rgba(13, 24, 39, 0.88)'; // --panel
const voidAnchor = '#020509';

const textPrimary = '#e6f1fa'; // --txt
const textSecondary = '#8fa8bc'; // --dim
const textMuted = 'rgba(143, 168, 188, 0.55)';

const hairline = 'rgba(94, 208, 255, 0.26)'; // --line
const hairlineBright = 'rgba(94, 208, 255, 0.5)'; // --line2

const theme = {
  colors: {
    // ---- Aurora core --------------------------------------------------
    transparent: 'transparent',

    // Void / background scale
    void: voidBase,
    voidElevated,
    voidAnchor,

    // Brand (primary accent — actions, active states, the signature)
    brand,
    brandBright,
    brandDark: 'rgba(6, 16, 25, 1)',

    // Secondary (info / data / links)
    secondary,
    secondaryLight,

    // Tertiary (staking / premium, rare)
    tertiary,

    // Semantic — success is DISTINCT from brand (B3); always icon+label paired
    success,
    warning,
    danger,

    // Text
    textPrimary,
    textSecondary,
    textMuted,

    // Glass / chrome surfaces — NEVER used on money surfaces (B1)
    glassSurface: 'rgba(13, 24, 39, 0.55)',
    glassSurfaceHover: 'rgba(17, 31, 50, 0.75)',
    glassBorder: hairline,
    glassBorderBright: hairlineBright,

    // Money surfaces (B1) — solid, opaque, max-contrast. No glass/glow allowed.
    moneySurfaceBg: '#070d16',
    moneySurfaceBorder: 'rgba(230, 241, 250, 0.18)',
    moneySurfaceText: textPrimary,

    // ---- LEGACY ALIASES (do not remove — components read these directly) --
    // Original palette preserved verbatim so existing screens keep rendering
    // identically until they're re-skinned in a later phase.
    primary: 'rgba(13, 24, 39, 1)',
    primaryLight: '#6fd6ff',
    primaryDark: 'rgba(6, 16, 25, 1)',
    translucentPrimary: 'rgb(1, 67, 83)',
    inactive: 'rgba(56, 71, 100, 1)',
    active: 'rgba(90, 220, 226, 1)',
    cancelled: 'rgba(139, 139, 150, 1)',
    secondaryLegacy: 'rgba(1, 67, 83, 1)',
    tertiaryLegacy: 'rgba(219, 38, 66, 1)',
    light: 'rgba(255, 255, 255, 1)',
    copy: 'rgba(84, 84, 84, 1)',
    dark: 'rgba(255, 255, 255, 1)',
    darker: 'rgba(29, 29, 29, 1)',
    translucentDark: 'rgba(50, 50, 50, 0.93)',
    lightShade: 'rgba(0, 0, 0, 0.1)',
    darkShade,
    darkSuccess: 'rgba(119, 132, 125, 0.68)',
    weak: 'rgba(136, 136, 136, 1)',
    morMain: '#6fd6ff',
    morLight: 'rgba(13, 24, 39, 1)',
    // BACKGROUNDS (legacy)
    medium: 'rgba(244, 244, 244, 1)',
    lightBlue: 'rgba(234, 247, 252, 1)',
    lightBG: 'rgba(237, 237, 237, 1)',
    xLight: 'rgba(247, 247, 247, 1)',
    darkGradient: 'linear-gradient(to bottom, #353535, #323232)',
    helpertextGray: 'rgba(112, 112, 112, 1)',
    placeholderGray: 'rgba(196, 196, 196, 1)',
  },

  // SIZES (legacy — preserved)
  sizes: {
    xSmall: 11,
    small: 14,
    medium: 16,
    large: 20,
    xLarge: 24,
    xxLarge: 32,
  },

  // ---- Typography -----------------------------------------------------
  // Inter for all UI/headings/body; Roboto Mono ONLY for data (balances,
  // addresses, hashes, session IDs) via the `.mono` utility class.
  // JARVIS is monospace throughout — the console voice, not a prose voice.
  fontUI:
    "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontProse:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontMono:
    "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

  // Clean type scale (1rem = 10px, set in index.html — this scale is in rem)
  type: {
    xs: '1.1rem',
    sm: '1.3rem',
    base: '1.6rem',
    md: '1.8rem',
    lg: '2.2rem',
    xl: '2.8rem',
    xxl: '3.6rem',
  },

  // FONT WEIGHTS (legacy shape preserved — `fileName` no longer resolves to a
  // real font file since Muli was never actually loaded; `value` is what
  // components read for CSS `font-weight`)
  weights: {
    xLight: { fileName: 'Muli-ExtraLight', value: '200' },
    light: { fileName: 'Muli-Light', value: '300' },
    regular: { fileName: 'Muli-Regular', value: '400' },
    semibold: { fileName: 'Muli-SemiBold', value: '600' },
    bold: { fileName: 'Muli-Bold', value: '700' },
    xBold: { fileName: 'Muli-ExtraBold', value: '800' },
    black: { fileName: 'Muli-Black', value: '900' },
  },

  textShadow: `0 1px 1px ${darkShade}`,
  spacing: (n: number) => n * 8, // used as rem multiplier

  // ---- Radii / shadows --------------------------------------------------
  // Nothing in this app is a hard rectangle. Every surface is rounded; the
  // scale just says by how much.
  radii: {
    sm: '8px',
    md: '12px',
    lg: '18px',
    xl: '24px',
    pill: '999px',
  },

  shadows: {
    glow: `0 0 24px rgba(94, 208, 255, 0.28)`,
    elevated: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },

  // ---- Motion (B4/B5: event-driven only, never ambient) ------------------
  motion: {
    duration: {
      fast: '120ms',
      base: '220ms',
      slow: '420ms',
    },
    easing: {
      standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      enter: 'cubic-bezier(0, 0, 0.2, 1)',
      exit: 'cubic-bezier(0.4, 0, 1, 1)',
    },
  },

  // ---- Effects intensity (B6: configurable futurism, 0 = plain mode) -----
  // Consumers multiply these into opacity/blur so a single toggle can flatten
  // all glass/glow to an effect-free look without touching component code.
  effects: {
    glassAlpha: 1,
    glowStrength: 1,
  },
} as const;

export default theme;
export type Theme = typeof theme;
