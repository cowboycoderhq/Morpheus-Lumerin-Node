// ============================================================================
// THEME SYSTEM — two selectable aesthetics over ONE token vocabulary.
//
// The app ships two looks the user picks at setup and can swap in Settings:
//   • aurora  — the JARVIS/Trinity flagship: cyan-on-void, monospace, glass,
//               glow, status orbs.
//   • classic — the calm Morpheus look: green-on-dark, sans UI, flat surfaces,
//               no glow (effects dialed to 0).
//
// Both variants expose the EXACT SAME KEYS, so every styled-component reads
// `props.theme.*` and re-skins purely by which value-set is active — no
// component branches on the variant. Structurally-restyled screens (onboarding,
// chat) keep their structure and simply render flat/green under classic.
//
// Binding spec for the aurora values: outputs/morpheus-ui-reskin-design-
// direction-2026-07-10.md (COUNCIL SYNTHESIS — B1-B8). Notably:
//   B1/B6 — money surfaces are solid/effect-free; glass/glow intensity is a
//           dialable token (effects.* = 0 -> plain mode), never forced.
//   B3    — success is a DISTINCT mint, not the brand accent.
//   B5    — motion tokens are for event-driven feedback, not ambient loops.
// ============================================================================

const darkShade = 'rgba(0, 0, 0, 0.2)';

// ---- Tokens shared by BOTH variants ----------------------------------------
// Sizes, weights, type scale, spacing, radii and motion are identity-level, not
// aesthetic — they stay constant so layout metrics don't shift when swapping.
const base = {
  sizes: {
    xSmall: 11,
    small: 14,
    medium: 16,
    large: 20,
    xLarge: 24,
    xxLarge: 32,
  },

  // Roboto Mono ONLY for data (balances, addresses, hashes, session IDs) via
  // the `.mono` utility — data is monospace in BOTH looks.
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

  // Every surface is rounded; the scale just says by how much. Shared so the
  // silhouette is constant across looks.
  radii: {
    sm: '8px',
    md: '12px',
    lg: '18px',
    xl: '24px',
    pill: '999px',
  },

  // Motion (B4/B5: event-driven only, never ambient)
  motion: {
    duration: { fast: '120ms', base: '220ms', slow: '420ms' },
    easing: {
      standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      enter: 'cubic-bezier(0, 0, 0.2, 1)',
      exit: 'cubic-bezier(0.4, 0, 1, 1)',
    },
  },
} as const;

// ============================================================================
// AURORA — the JARVIS/Trinity flagship (values verbatim from the crypto-version
// design system so this look renders identically to the product build).
// ============================================================================
const auroraBrand = '#6fd6ff'; // JARVIS cyan — accent / actions / the signature
const auroraBrandBright = '#c2efff';
const auroraTertiary = '#7E61F8'; // violet — staking/premium, sparingly
const auroraSuccess = '#59e3a7'; // LIVE/OK only, never an action
const auroraWarning = '#f0c060';
const auroraDanger = '#e05c73'; // desaturated: a warning, not an alarm
const auroraTextPrimary = '#e6f1fa';
const auroraTextSecondary = '#8fa8bc';
const auroraHairline = 'rgba(94, 208, 255, 0.26)';
const auroraHairlineBright = 'rgba(94, 208, 255, 0.5)';

const aurora = {
  ...base,
  fontUI:
    "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  colors: {
    transparent: 'transparent',

    // Void / background scale
    void: '#04070c',
    voidElevated: 'rgba(13, 24, 39, 0.88)',
    voidAnchor: '#020509',

    // Brand (primary accent — actions, active states, the signature)
    brand: auroraBrand,
    brandBright: auroraBrandBright,
    brandDark: 'rgba(6, 16, 25, 1)',

    // Secondary (info / data / links) — same cyan family
    secondary: auroraBrand,
    secondaryLight: auroraBrandBright,

    // Tertiary (staking / premium, rare)
    tertiary: auroraTertiary,

    // Semantic — success DISTINCT from brand (B3); always icon+label paired
    success: auroraSuccess,
    warning: auroraWarning,
    danger: auroraDanger,

    // Text
    textPrimary: auroraTextPrimary,
    textSecondary: auroraTextSecondary,
    textMuted: 'rgba(143, 168, 188, 0.55)',

    // Glass / chrome surfaces — NEVER used on money surfaces (B1)
    glassSurface: 'rgba(13, 24, 39, 0.55)',
    glassSurfaceHover: 'rgba(17, 31, 50, 0.75)',
    glassBorder: auroraHairline,
    glassBorderBright: auroraHairlineBright,

    // Money surfaces (B1) — solid, opaque, max-contrast. No glass/glow.
    moneySurfaceBg: '#070d16',
    moneySurfaceBorder: 'rgba(230, 241, 250, 0.18)',
    moneySurfaceText: auroraTextPrimary,

    // ---- LEGACY ALIASES (components read these directly) ------------------
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
    medium: 'rgba(244, 244, 244, 1)',
    lightBlue: 'rgba(234, 247, 252, 1)',
    lightBG: 'rgba(237, 237, 237, 1)',
    xLight: 'rgba(247, 247, 247, 1)',
    darkGradient: 'linear-gradient(to bottom, #353535, #323232)',
    helpertextGray: 'rgba(112, 112, 112, 1)',
    placeholderGray: 'rgba(196, 196, 196, 1)',
  },
  shadows: {
    glow: `0 0 24px rgba(94, 208, 255, 0.28)`,
    elevated: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  // B6: configurable futurism — consumers multiply these into glass opacity /
  // glow strength. Aurora runs them at full.
  effects: {
    glassAlpha: 1,
    glowStrength: 1,
  },
} as const;

// ============================================================================
// CLASSIC — the calm Morpheus look. Same keys, green/flat values, effects = 0
// so any glass/glow a component asks for collapses to a solid, quiet surface.
// The legacy aliases are the ORIGINAL Morpheus palette, verbatim.
// ============================================================================
const classicBrand = 'rgba(32, 220, 142, 1)'; // Morpheus green — the accent
const classicBrandBright = 'rgba(102, 242, 184, 1)';
const classicVoid = 'rgba(12, 31, 23, 1)'; // deep Morpheus green-black
const classicPanel = 'rgba(23, 54, 41, 1)';
const classicText = 'rgba(255, 255, 255, 1)';
const classicTextDim = 'rgba(198, 210, 204, 1)';

const classic = {
  ...base,
  fontUI: // classic UI is sans, not monospace — the calmer voice
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  colors: {
    transparent: 'transparent',

    void: classicVoid,
    voidElevated: classicPanel,
    voidAnchor: 'rgba(8, 20, 13, 1)',

    brand: classicBrand,
    brandBright: classicBrandBright,
    brandDark: 'rgba(12, 31, 23, 1)',

    secondary: 'rgba(90, 220, 226, 1)', // teal
    secondaryLight: 'rgba(155, 235, 240, 1)',

    tertiary: 'rgba(219, 38, 66, 1)',

    success: 'rgba(57, 158, 90, 1)',
    warning: 'rgba(255, 200, 87, 1)',
    danger: 'rgba(212, 96, 69, 1)',

    textPrimary: classicText,
    textSecondary: classicTextDim,
    textMuted: 'rgba(198, 210, 204, 0.6)',

    // Flat surfaces: near-opaque panels, hairline borders, no translucency to
    // speak of. effects.glassAlpha = 0 flattens anything that modulates blur.
    glassSurface: 'rgba(23, 54, 41, 0.96)',
    glassSurfaceHover: 'rgba(30, 66, 51, 0.98)',
    glassBorder: 'rgba(32, 220, 142, 0.22)',
    glassBorderBright: 'rgba(32, 220, 142, 0.44)',

    // Money surfaces — solid, opaque, max-contrast (same rule in both looks).
    moneySurfaceBg: 'rgba(9, 24, 17, 1)',
    moneySurfaceBorder: 'rgba(255, 255, 255, 0.18)',
    moneySurfaceText: classicText,

    // ---- LEGACY ALIASES — ORIGINAL Morpheus palette, verbatim -------------
    primary: 'rgba(23, 54, 41, 1)',
    primaryLight: 'rgba(32, 220, 142, 1)',
    primaryDark: 'rgba(12,31,23,1)',
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
    morMain: 'rgba(32, 220, 142, 1)',
    morLight: 'rgba(23, 54, 41, 1)',
    medium: 'rgba(244, 244, 244, 1)',
    lightBlue: 'rgba(234, 247, 252, 1)',
    lightBG: 'rgba(237, 237, 237, 1)',
    xLight: 'rgba(247, 247, 247, 1)',
    darkGradient: 'linear-gradient(to bottom, #353535, #323232)',
    helpertextGray: 'rgba(112, 112, 112, 1)',
    placeholderGray: 'rgba(196, 196, 196, 1)',
  },
  shadows: {
    glow: 'none', // classic has no glow
    elevated: '0 6px 20px rgba(0, 0, 0, 0.35)',
  },
  effects: {
    glassAlpha: 0, // plain mode — flatten any glass a component requests
    glowStrength: 0,
  },
} as const;

// ---- Public API ------------------------------------------------------------
export const themes = { aurora, classic };
export type ThemeVariant = keyof typeof themes; // 'aurora' | 'classic'
export const THEME_VARIANTS: ThemeVariant[] = ['aurora', 'classic'];
export const DEFAULT_VARIANT: ThemeVariant = 'aurora'; // the flagship

// The `Theme` type is the aurora shape; classic mirrors every key. Existing
// `import theme from './ui/theme'` sites keep working (default = the flagship).
export type Theme = typeof aurora;

export const getTheme = (variant: ThemeVariant): Theme =>
  (themes[variant] ?? themes[DEFAULT_VARIANT]) as Theme;

export default aurora;
