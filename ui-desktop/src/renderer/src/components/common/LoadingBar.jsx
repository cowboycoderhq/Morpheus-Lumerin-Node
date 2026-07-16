import React from 'react';
import styled, { keyframes } from 'styled-components';

const loading = keyframes`
    from {left: -200px; width: 30%;}
    50% {width: 30%;}
    70% {width: 70%;}
    80% { left: 50%;}
    95% {left: 120%;}
    to {left: 100%;}
`;

// An ongoing-process indicator (a real fetch/sync in flight) — the sweep
// reflects real work, not ambient decoration (B5). Honors
// prefers-reduced-motion with a static filled-bar fallback.
const Container = styled.div`
  width: 100%;
  background-color: ${p => p.theme.colors.brand};
  padding: 0.2rem;
  border-radius: ${p => p.theme.radii.pill};
`;

const Bar = styled.div`
  position: relative;
  overflow: hidden;
  height: 0.4rem;
  border-radius: ${p => p.theme.radii.sm};

  &:before {
    border-radius: ${p => p.theme.radii.sm};
    height: 0.4rem;
    display: block;
    position: absolute;
    content: '';
    left: -200px;
    width: 200px;
    background-color: ${p => p.theme.colors.voidElevated};
    animation: ${loading} 2s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &:before {
      animation: none;
      left: 0;
      width: 100%;
    }
  }
`;

export default function LoadingBar() {
  return (
    <Container>
      <Bar />
    </Container>
  );
}
