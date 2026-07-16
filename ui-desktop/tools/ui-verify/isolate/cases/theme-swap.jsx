import React from 'react';
import { createRoot } from 'react-dom/client';
import styled from 'styled-components';
import {
  ThemeVariantProvider,
  useThemeVariant,
} from '../../../../src/renderer/src/ui/ThemeVariantContext';
import { THEME_VARIANTS } from '../../../../src/renderer/src/ui/theme';

// A probe that reads live theme tokens through styled-components, so a variant
// swap is observable as a real computed-style change — not just state.
const Swatch = styled.div`
  background: ${(p) => p.theme.colors.brand};
  font-family: ${(p) => p.theme.fontUI};
  padding: 24px;
  width: 220px;
  border-radius: ${(p) => p.theme.radii.md};
`;

function Probe() {
  const { variant, setVariant } = useThemeVariant();
  return (
    <div style={{ padding: 24 }}>
      <Swatch data-testid="brand-swatch">brand · {variant}</Swatch>
      <div data-testid="active-variant">{variant}</div>
      {THEME_VARIANTS.map((v) => (
        <button
          key={v}
          data-testid={`set-${v}`}
          onClick={() => setVariant(v)}
          style={{ margin: 4 }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <ThemeVariantProvider>
    <Probe />
  </ThemeVariantProvider>,
);
