import React from 'react';
import styled, { keyframes } from 'styled-components';

// A real ongoing-process indicator (transaction pending, data loading) — the
// motion here reflects an actual in-flight operation, not ambient decoration
// (B5). Honors prefers-reduced-motion with a static ring fallback.
const Container = styled.div`
  display: inline-block;
  background-color: ${p => p.theme.colors.light};
  border-radius: ${({ size }) => size};
  padding: 2px;
  box-shadow: ${p => p.theme.shadows.elevated};
`;

const rotate = keyframes`
  100% {
    transform: rotate(360deg);
  }
`;

const Svg = styled.svg`
  transform-origin: center center;
  animation: ${rotate} 2s linear infinite;
  display: block;
  height: ${({ size }) => size};
  width: ${({ size }) => size};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const dash = keyframes`
  0% {
    stroke-dasharray: 1, 200;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 89, 200;
    stroke-dashoffset: -35px;
  }
  100% {
    stroke-dasharray: 89, 200;
    stroke-dashoffset: -124px;
  }
`;

const Circle = styled.circle`
  stroke-dasharray: 1, 200;
  stroke-dashoffset: 0;
  animation: ${dash} 1.5s ease-in-out infinite;
  stroke-linecap: round;
  stroke: ${p => p.theme.colors.brand};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    stroke-dasharray: 65, 200;
  }
`;

export default function Spinner({ size = '12px', ...rest }) {
  return (
    <Container size={size}>
      <Svg viewBox="25 25 50 50" size={size} {...rest}>
        <Circle
          strokeMiterlimit="10"
          strokeWidth="6"
          fill="none"
          cx="50"
          cy="50"
          r="20"
        />
      </Svg>
    </Container>
  );
}
