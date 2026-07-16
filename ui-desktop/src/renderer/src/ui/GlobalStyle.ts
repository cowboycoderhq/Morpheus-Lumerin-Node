import { createGlobalStyle } from 'styled-components';

// ============================================================================
// The app frame's own colours — page background and scrollbars.
//
// These lived as hardcoded literals in `src/renderer/index.html`, which is
// static HTML and therefore cannot read the theme. That made them the one part
// of the app a theme swap could never reach: selecting Aurora produced cyan
// chrome sitting on a Morpheus-green page with green scrollbars. It shows up
// most on onboarding and Login, where `AltLayout` is transparent and the body
// paints the whole screen.
//
// It also evaded the frozen-value gate, which walks .jsx/.tsx and never opened
// an .html file — a literal is invisible to a sweep that doesn't read the file
// it lives in. The gate now scans .html/.css too.
//
// index.html keeps what is genuinely theme-independent: the 10px root that
// every rem in the product is authored against, box-sizing, and fonts.
// ============================================================================

export const GlobalStyle = createGlobalStyle`
  body {
    /* Was #03160e!important. The !important is why nothing could override it —
       including the theme. This is the same "void" token Router paints the app
       frame with, so the page behind onboarding now matches the page behind
       everything else instead of being a second, slightly different green. */
    background: ${(p) => p.theme.colors.void};
    color: ${(p) => p.theme.colors.textPrimary};
  }

  ::-webkit-scrollbar {
    background-color: ${(p) => p.theme.colors.voidAnchor};
    width: 16px;
  }

  /* Was #20dc8e80 — classic's green at ~50% alpha, which is exactly what
     brandTint(0.5) resolves to under classic, and cyan under aurora. */
  ::-webkit-scrollbar-thumb {
    background-color: ${(p) => p.theme.colors.brandTint(0.5)};
    border: 0.25em solid ${(p) => p.theme.colors.voidAnchor};
    border-radius: 16px;
  }

  ::-webkit-scrollbar-corner {
    background-color: ${(p) => p.theme.colors.voidAnchor};
  }
`;

export default GlobalStyle;
